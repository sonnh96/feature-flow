from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import shlex
import sqlite3
import subprocess
from typing import Any

from app.core.config import settings
from app.schemas import GitNexusIngestRequest, GitNexusProcess, GitNexusRoute, ProjectSyncRequest


SYMBOL_LABELS = {
    "Function",
    "Class",
    "Interface",
    "Method",
    "CodeElement",
    "Struct",
    "Enum",
    "Macro",
    "Typedef",
    "Union",
    "Namespace",
    "Trait",
    "Impl",
    "TypeAlias",
    "Const",
    "Static",
    "Variable",
    "Property",
    "Record",
    "Delegate",
    "Annotation",
    "Constructor",
    "Template",
    "Module",
}


class GitNexusReaderError(RuntimeError):
    pass


@dataclass(frozen=True)
class GitNexusSqliteSource:
    repo_name: str
    repo_path: Path
    sqlite_path: Path
    meta_path: Path
    project_name: str | None
    description: str | None
    requested_by: str | None
    include_symbols_limit: int
    pipeline_version: str
    prompt_version: str | None
    model_name: str | None


def build_project_sync_request_from_gitnexus(payload: GitNexusIngestRequest) -> ProjectSyncRequest:
    source = resolve_gitnexus_source(payload)
    metadata = read_meta_json(source.meta_path)
    clusters = read_communities(source.sqlite_path)
    processes = read_processes(source.sqlite_path)
    routes = read_routes(source.sqlite_path)
    symbols = read_symbols(source.sqlite_path, source.include_symbols_limit)

    return ProjectSyncRequest(
        repo_name=source.repo_name,
        project_name=source.project_name or metadata.get("name") or source.repo_name,
        description=source.description,
        revision=metadata.get("lastCommit") or metadata.get("last_commit"),
        context={
            "repo_path": str(source.repo_path),
            "sqlite_path": str(source.sqlite_path),
            "indexed_at": metadata.get("indexedAt") or metadata.get("indexed_at"),
            "stats": metadata.get("stats") or build_sqlite_stats(source.sqlite_path),
            "source": "gitnexus_sqlite_export",
        },
        clusters=clusters,
        processes=processes,
        routes=routes,
        symbols=symbols,
        pipeline_version=source.pipeline_version,
        prompt_version=source.prompt_version,
        model_name=source.model_name,
        requested_by=source.requested_by,
    )


def resolve_gitnexus_source(payload: GitNexusIngestRequest) -> GitNexusSqliteSource:
    repo_path = Path(
        payload.repo_path
        or settings.gitnexus_default_repo_path
        or "."
    ).expanduser().resolve()
    if not repo_path.exists():
        raise GitNexusReaderError(f"Repository path does not exist: {repo_path}")

    repo_name = payload.repo_name or repo_path.name
    sqlite_path = Path(
        payload.sqlite_path
        or settings.gitnexus_default_sqlite_path
        or repo_path / ".gitnexus" / "lbug-export.sqlite"
    ).expanduser()
    if not sqlite_path.is_absolute():
        sqlite_path = (repo_path / sqlite_path).resolve()
    else:
        sqlite_path = sqlite_path.resolve()

    if payload.auto_convert:
        convert_lbug_to_sqlite(
            repo_path=repo_path,
            lbug_path=Path(payload.lbug_path).expanduser().resolve()
            if payload.lbug_path
            else repo_path / ".gitnexus" / "lbug",
            sqlite_path=sqlite_path,
            command=payload.convert_command or settings.gitnexus_convert_command,
        )

    if not sqlite_path.exists():
        raise GitNexusReaderError(
            "GitNexus SQLite export not found. Run "
            "`gitnexus convert-lbug-sqlite --lbug .gitnexus/lbug --out .gitnexus/lbug-export.sqlite --force` "
            "or call this worker with auto_convert=true."
        )

    return GitNexusSqliteSource(
        repo_name=repo_name,
        repo_path=repo_path,
        sqlite_path=sqlite_path,
        meta_path=repo_path / ".gitnexus" / "meta.json",
        project_name=payload.project_name,
        description=payload.description,
        requested_by=payload.requested_by,
        include_symbols_limit=payload.include_symbols_limit,
        pipeline_version=payload.pipeline_version,
        prompt_version=payload.prompt_version,
        model_name=payload.model_name,
    )


def convert_lbug_to_sqlite(
    *,
    repo_path: Path,
    lbug_path: Path,
    sqlite_path: Path,
    command: str,
) -> None:
    if not lbug_path.exists():
        raise GitNexusReaderError(f"GitNexus LadybugDB file not found: {lbug_path}")
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    command_parts = shlex.split(command)
    if not command_parts:
        raise GitNexusReaderError("GitNexus convert command cannot be empty")
    args = [
        *command_parts,
        "--lbug",
        str(lbug_path),
        "--out",
        str(sqlite_path),
        "--force",
    ]
    completed = subprocess.run(
        args,
        cwd=repo_path,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise GitNexusReaderError(f"GitNexus conversion failed: {detail}")


def read_meta_json(meta_path: Path) -> dict[str, Any]:
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GitNexusReaderError(f"Invalid GitNexus meta.json: {exc}") from exc


def connect(sqlite_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(sqlite_path))
    connection.row_factory = sqlite3.Row
    return connection


def decode_extra(row: sqlite3.Row) -> dict[str, Any]:
    raw = row["extra_json"] if "extra_json" in row.keys() else None
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def read_communities(sqlite_path: Path) -> list[dict[str, Any]]:
    with connect(sqlite_path) as db:
        rows = db.execute(
            """
            SELECT id, name, description, extra_json
            FROM nodes
            WHERE label = 'Community'
            ORDER BY name
            """
        ).fetchall()
    clusters = []
    for row in rows:
        extra = decode_extra(row)
        clusters.append(
            {
                "name": extra.get("heuristicLabel") or row["name"] or row["id"],
                "symbols": extra.get("symbolCount"),
                "cohesion": extra.get("cohesion"),
                "members": [],
                "description": row["description"],
                "keywords": extra.get("keywords") or [],
                "source_id": row["id"],
            }
        )
    return sorted(clusters, key=lambda item: item.get("symbols") or 0, reverse=True)


def read_processes(sqlite_path: Path) -> list[GitNexusProcess]:
    with connect(sqlite_path) as db:
        rows = db.execute(
            """
            SELECT id, name, description, extra_json
            FROM nodes
            WHERE label = 'Process'
            ORDER BY name
            """
        ).fetchall()
    processes = []
    for row in rows:
        extra = decode_extra(row)
        processes.append(
            GitNexusProcess(
                name=extra.get("heuristicLabel") or row["name"] or row["id"],
                type=extra.get("processType"),
                steps=extra.get("stepCount"),
                symbols=[],
            )
        )
    return sorted(processes, key=lambda item: item.steps or 0, reverse=True)


def read_routes(sqlite_path: Path) -> list[GitNexusRoute]:
    with connect(sqlite_path) as db:
        rows = db.execute(
            """
            SELECT id, name, file_path, extra_json
            FROM nodes
            WHERE label = 'Route'
            ORDER BY file_path, name
            """
        ).fetchall()
    routes = []
    for row in rows:
        extra = decode_extra(row)
        routes.append(
            GitNexusRoute(
                method=extra.get("method"),
                path=row["name"] or row["id"],
                handler=row["file_path"],
                consumers=[],
            )
        )
    return routes


def read_symbols(sqlite_path: Path, limit: int) -> list[dict[str, Any]]:
    placeholders = ",".join("?" for _ in SYMBOL_LABELS)
    with connect(sqlite_path) as db:
        rows = db.execute(
            f"""
            SELECT id, label, name, file_path, start_line, end_line, description
            FROM nodes
            WHERE label IN ({placeholders})
            ORDER BY label, file_path, start_line
            LIMIT ?
            """,
            [*sorted(SYMBOL_LABELS), limit],
        ).fetchall()
    return [
        {
            "id": row["id"],
            "kind": row["label"],
            "name": row["name"],
            "file_path": row["file_path"],
            "start_line": row["start_line"],
            "end_line": row["end_line"],
            "description": row["description"],
        }
        for row in rows
    ]


def build_sqlite_stats(sqlite_path: Path) -> dict[str, int]:
    with connect(sqlite_path) as db:
        node_count = db.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        edge_count = db.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
        community_count = db.execute("SELECT COUNT(*) FROM nodes WHERE label = 'Community'").fetchone()[0]
        process_count = db.execute("SELECT COUNT(*) FROM nodes WHERE label = 'Process'").fetchone()[0]
    return {
        "nodes": int(node_count),
        "edges": int(edge_count),
        "communities": int(community_count),
        "processes": int(process_count),
    }
