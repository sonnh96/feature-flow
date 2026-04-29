from __future__ import annotations

import argparse
import asyncio
from datetime import date, datetime
import json
from pathlib import Path
from typing import Any
from uuid import UUID

from app.db.session import AsyncSessionLocal
from app.schemas import GitNexusIngestRequest
from app.services.feature_intelligence import sync_project_from_snapshot
from app.services.gitnexus_reader import build_project_sync_request_from_gitnexus


def json_default(value: Any) -> str:
    if isinstance(value, (UUID, datetime, date, Path)):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


async def run_gitnexus_sync(payload: GitNexusIngestRequest) -> dict[str, Any]:
    snapshot = build_project_sync_request_from_gitnexus(payload)
    async with AsyncSessionLocal() as db:
        return await sync_project_from_snapshot(db, snapshot)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read a GitNexus SQLite export and sync business features into the app database."
    )
    parser.add_argument("--repo-path", help="Path to the source repository that contains .gitnexus/")
    parser.add_argument("--repo-name", help="GitNexus repository name. Defaults to repo directory name.")
    parser.add_argument("--project-name", help="Business project name to create/update.")
    parser.add_argument("--description", help="Project description.")
    parser.add_argument("--sqlite-path", help="Path to .gitnexus/lbug-export.sqlite.")
    parser.add_argument("--lbug-path", help="Path to .gitnexus/lbug. Used when --auto-convert is set.")
    parser.add_argument(
        "--auto-convert",
        action="store_true",
        help="Run the GitNexus lbug-to-SQLite converter before reading the graph.",
    )
    parser.add_argument(
        "--convert-command",
        help='Command used for conversion, e.g. "gitnexus convert-lbug-sqlite" or "npx gitnexus convert-lbug-sqlite".',
    )
    parser.add_argument("--requested-by", help="User or automation actor recorded in feature history.")
    parser.add_argument(
        "--symbol-limit",
        type=int,
        default=500,
        help="Maximum number of raw symbols to carry into the snapshot metadata.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    payload = GitNexusIngestRequest(
        repo_name=args.repo_name,
        repo_path=args.repo_path,
        project_name=args.project_name,
        description=args.description,
        sqlite_path=args.sqlite_path,
        lbug_path=args.lbug_path,
        auto_convert=args.auto_convert,
        convert_command=args.convert_command,
        requested_by=args.requested_by,
        include_symbols_limit=args.symbol_limit,
    )
    result = asyncio.run(run_gitnexus_sync(payload))
    print(json.dumps(result, indent=2, default=json_default))


if __name__ == "__main__":
    main()
