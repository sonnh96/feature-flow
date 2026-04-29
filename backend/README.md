# Backend (FastAPI)

This folder contains the FastAPI backend for the Feature Intelligence Layer.

Quickstart (local using docker-compose)

1. docker-compose up --build
2. The API will be available at http://localhost:8000
3. Run migrations (Alembic) inside the backend container or locally:
   - alembic upgrade head

Notes
- Database URL is configured via DATABASE_URL environment variable (docker-compose sets it automatically).

GitNexus sync

- `POST /api/v1/projects/sync` ingests a GitNexus snapshot containing clusters, processes, routes, symbols, and repository metadata.
- `POST /api/v1/projects/sync/gitnexus` reads a GitNexus SQLite export and then runs the same sync pipeline.
- The sync job stores the raw snapshot, mines deterministic feature candidates, creates reviewable features, saves evidence/history/version records, and opens review tasks.
- `GET /api/v1/search?q=...` searches generated and manually curated feature records.

Worker usage:

```bash
python -m app.workers.gitnexus_sync \
  --repo-path /Volumes/Data/develop/feature-flow \
  --repo-name feature-flow \
  --project-name "Feature Flow" \
  --auto-convert
```

```bash
 cd /Volumes/Data/develop/feature-flow/backend

python -m app.workers.gitnexus_sync \
  --repo-path /Volumes/Data/develop/feature-flow \
  --repo-name feature-flow \
  --project-name "Feature Flow" \
  --auto-convert \
  --requested-by analyst@example.com

Or call the API:

POST /api/v1/projects/sync/gitnexus

{
  "repo_path": "/Volumes/Data/develop/feature-flow",
  "repo_name": "feature-flow",
  "project_name": "Feature Flow",
  "auto_convert": true,
  "requested_by": "analyst@example.com"
}
```
