# Feature Intelligence Layer Implementation

This project now treats GitNexus as the technical source and stores business-facing output in the application database.

## Implemented Flow

1. Generate or locate a GitNexus SQLite export from `<repo>/.gitnexus/lbug`.
2. Call the worker or `POST /api/v1/projects/sync/gitnexus`.
3. The worker reads GitNexus communities, processes, routes, symbols, and metadata.
4. The worker builds the normalized snapshot used by `POST /api/v1/projects/sync`.
5. The backend creates or updates the `Project` mapped to `repo_name`.
6. The raw snapshot is saved in `repository_snapshots` and linked to an `extraction_jobs` record.
7. Deterministic candidate mining creates `feature_candidates` from clusters, process groups, processes, and route groups.
8. Candidates become reviewable `features` with codes, hierarchy, confidence, evidence, versions, and history.
9. Related-feature links are generated between sibling process candidates.
10. Review tasks are created for generated features.
11. Users can browse features, inspect evidence/history, approve/reject/reparent/merge/split, and search globally.

## Worker Usage

Run from `backend/`:

```bash
python -m app.workers.gitnexus_sync \
  --repo-path /Volumes/Data/develop/feature-flow \
  --repo-name feature-flow \
  --project-name "Feature Flow" \
  --sqlite-path /Volumes/Data/develop/feature-flow/.gitnexus/lbug-export.sqlite \
  --requested-by analyst@example.com
```

If the SQLite export does not exist, let the worker run the GitNexus converter:

```bash
python -m app.workers.gitnexus_sync \
  --repo-path /Volumes/Data/develop/feature-flow \
  --repo-name feature-flow \
  --project-name "Feature Flow" \
  --auto-convert \
  --convert-command "gitnexus convert-lbug-sqlite"
```

Equivalent API call:

```http
POST /api/v1/projects/sync/gitnexus
Content-Type: application/json
```

```json
{
  "repo_path": "/Volumes/Data/develop/feature-flow",
  "repo_name": "feature-flow",
  "project_name": "Feature Flow",
  "sqlite_path": "/Volumes/Data/develop/feature-flow/.gitnexus/lbug-export.sqlite",
  "auto_convert": false,
  "requested_by": "analyst@example.com"
}
```

The worker reads:

| GitNexus source | Business layer use |
|---|---|
| `Community` nodes | High-level feature candidates / epics |
| `Process` nodes | Workflow features and sub-features |
| `Route` nodes | API capability candidates |
| Symbol nodes | Supporting metadata and future AI context |
| `.gitnexus/meta.json` | Repo revision, index timestamp, stats |

## Snapshot Payload

You can still bypass the worker and submit a normalized snapshot directly.

```json
{
  "repo_name": "feature-flow",
  "project_name": "Feature Flow",
  "revision": "372eb028",
  "clusters": [
    { "name": "Components", "symbols": 47, "cohesion": "83%" }
  ],
  "processes": [
    { "name": "FeatureTree -> OnChange", "type": "cross_community", "steps": 5 }
  ],
  "routes": [
    { "method": "GET", "path": "/api/v1/projects" }
  ],
  "requested_by": "analyst@example.com"
}
```

## Key Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/projects/sync/gitnexus` | Read GitNexus SQLite export and generate feature candidates |
| `POST` | `/api/v1/projects/sync` | Ingest a GitNexus snapshot and generate feature candidates |
| `GET` | `/api/v1/projects/{id}/features?hierarchy=true` | Browse project features as a tree |
| `GET` | `/api/v1/projects/{id}/review-tasks` | Review queue for generated or changed features |
| `GET` | `/api/v1/features/{id}` | Feature detail with evidence and relations |
| `POST` | `/api/v1/features/{id}/approve` | Approve generated feature |
| `POST` | `/api/v1/features/{id}/reject` | Reject generated feature |
| `POST` | `/api/v1/features/{id}/reparent` | Move feature in hierarchy |
| `POST` | `/api/v1/features/{id}/merge` | Mark source as duplicate of another feature |
| `POST` | `/api/v1/features/{id}/split` | Create child features from a broad candidate |
| `GET` | `/api/v1/features/{id}/history` | Field-level and generation history |
| `GET` | `/api/v1/search?q=...` | Global business feature search |

## Review Policy

Generated features are stored as `review_status = needs_review`. A reviewer must approve, reject, rename, merge, split, or reparent before the feature should be treated as trusted business documentation.

## Evidence Policy

Every generated feature includes at least one `feature_evidence` record. Evidence may point to a GitNexus cluster, process, route, symbol, or future commit reference. Search and detail screens should expose this evidence so reviewers can validate business meaning against source code.
