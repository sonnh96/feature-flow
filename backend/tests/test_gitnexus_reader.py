import json
import sqlite3

from app.schemas import GitNexusIngestRequest
from app.services.gitnexus_reader import build_project_sync_request_from_gitnexus


def test_build_project_sync_request_from_sqlite_export(tmp_path):
    repo_path = tmp_path / "repo"
    gitnexus_path = repo_path / ".gitnexus"
    gitnexus_path.mkdir(parents=True)
    sqlite_path = gitnexus_path / "lbug-export.sqlite"
    (gitnexus_path / "meta.json").write_text(
        json.dumps(
            {
                "lastCommit": "abc123",
                "indexedAt": "2026-04-26T00:00:00Z",
                "stats": {"nodes": 4, "edges": 1, "communities": 1, "processes": 1},
            }
        ),
        encoding="utf-8",
    )

    db = sqlite3.connect(sqlite_path)
    db.executescript(
        """
        CREATE TABLE nodes (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          name TEXT,
          file_path TEXT,
          start_line INTEGER,
          end_line INTEGER,
          is_exported INTEGER,
          content TEXT,
          description TEXT,
          extra_json TEXT
        );
        CREATE TABLE edges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id TEXT NOT NULL,
          source_label TEXT,
          target_id TEXT NOT NULL,
          target_label TEXT,
          type TEXT NOT NULL,
          confidence REAL,
          reason TEXT,
          step INTEGER
        );
        """
    )
    db.executemany(
        """
        INSERT INTO nodes (
          id, label, name, file_path, start_line, end_line, description, extra_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "comm_1",
                "Community",
                "Components",
                None,
                None,
                None,
                "UI components",
                json.dumps({"heuristicLabel": "Components", "symbolCount": 47, "cohesion": 0.83}),
            ),
            (
                "proc_1",
                "Process",
                "FeatureTree -> OnChange",
                None,
                None,
                None,
                None,
                json.dumps({"heuristicLabel": "FeatureTree -> OnChange", "processType": "cross_community", "stepCount": 5}),
            ),
            (
                "route_1",
                "Route",
                "/api/v1/projects",
                "backend/app/api/v1/projects.py",
                None,
                None,
                None,
                json.dumps({"method": "GET"}),
            ),
            (
                "Function:app.py:sync",
                "Function",
                "sync",
                "app.py",
                1,
                10,
                "Sync function",
                None,
            ),
        ],
    )
    db.commit()
    db.close()

    snapshot = build_project_sync_request_from_gitnexus(
        GitNexusIngestRequest(
            repo_path=str(repo_path),
            repo_name="feature-flow",
            project_name="Feature Flow",
            sqlite_path=str(sqlite_path),
        )
    )

    assert snapshot.repo_name == "feature-flow"
    assert snapshot.revision == "abc123"
    assert snapshot.clusters[0].name == "Components"
    assert snapshot.processes[0].name == "FeatureTree -> OnChange"
    assert snapshot.routes[0].path == "/api/v1/projects"
    assert snapshot.symbols[0]["name"] == "sync"
