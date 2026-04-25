# Docker Compose + Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level `docker-compose.yml` that runs backend + frontend + postgres together, then add comprehensive unit tests for all backend API functions and run them in CI-style via `docker compose run`.

**Architecture:** Single `docker-compose.yml` at repo root orchestrates three services: `db` (postgres:14), `backend` (FastAPI/uvicorn), `frontend` (Vite dev server). A fourth ephemeral `test` service runs pytest against a throwaway in-memory SQLite DB (no postgres needed for unit tests — keeps them fast and isolated). Frontend tests use Vitest with mocked Supabase and store.

**Tech Stack:** Docker Compose v2, Python 3.11, FastAPI, pytest + pytest-asyncio + httpx (ASGI transport), SQLite async (aiosqlite) for test DB, Vitest + @testing-library/react for frontend.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | **Create** (repo root) | Full stack: db + backend + frontend |
| `frontend/Dockerfile` | **Create** | Build/serve frontend via Vite dev |
| `backend/Dockerfile` | **Exists** — minor fix | Already correct; add `pytest` service target |
| `backend/requirements.txt` | **Modify** | Add `aiosqlite`, `pytest-asyncio`, `anyio[trio]` |
| `backend/tests/conftest.py` | **Create** | Async test client wired to SQLite in-memory DB |
| `backend/tests/test_projects.py` | **Create** | Full CRUD tests for `/api/v1/projects/` |
| `backend/tests/test_features.py` | **Create** | Full CRUD tests for `/api/v1/features/` |
| `backend/tests/test_versions.py` | **Create** | Tests for `/api/v1/features/{id}/versions/` |
| `backend/tests/test_health.py` | **Modify** | Fix transport — use `ASGITransport` (httpx ≥0.24) |
| `frontend/package.json` | **Modify** | Add `test` and `test:run` scripts |
| `frontend/src/lib/__tests__/store.test.ts` | **Create** | Unit tests for all Zustand store actions |
| `frontend/src/lib/__tests__/utils.test.ts` | **Create** | Tests for helper functions |
| `frontend/vite.config.ts` | **Modify** | Add `test` block for Vitest |

---

## Task 1: Root docker-compose.yml

**Files:**
- Create: `docker-compose.yml` (repo root)

- [ ] **Step 1: Create root docker-compose.yml**

```yaml
# docker-compose.yml  (repo root)
version: "3.9"

services:
  db:
    image: postgres:14-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: featuredb
    volumes:
      - db-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/featuredb
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://backend:8000
      VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:-https://placeholder.supabase.co}
      VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID:-placeholder}
    depends_on:
      - backend

  # Ephemeral service — run with: docker compose run --rm test
  test:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: pytest tests/ -v --tb=short
    volumes:
      - ./backend:/app
    environment:
      DATABASE_URL: sqlite+aiosqlite:///./test.db
    # No depends_on db — SQLite is used for tests

volumes:
  db-data:
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la /Volumes/Data/develop/feature-flow/docker-compose.yml
```
Expected: file present, ~50 lines.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add docker-compose.yml
git commit -m "feat: add root docker-compose.yml with db/backend/frontend/test services"
```

---

## Task 2: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create frontend/Dockerfile**

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

COPY package.json bun.lockb* package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
```

- [ ] **Step 2: Verify it builds (dry-run syntax check)**

```bash
docker build --no-cache -f /Volumes/Data/develop/feature-flow/frontend/Dockerfile \
  /Volumes/Data/develop/feature-flow/frontend --progress=plain 2>&1 | tail -20
```
Expected: `Successfully built` or `writing image sha256:...`

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add frontend/Dockerfile
git commit -m "feat: add frontend Dockerfile for Vite dev server"
```

---

## Task 3: Fix backend requirements + test deps

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Replace requirements.txt**

```text
fastapi
uvicorn[standard]
SQLAlchemy>=2.0
asyncpg
aiosqlite
alembic
pydantic
pydantic-settings
python-dotenv
httpx
pytest
pytest-asyncio
anyio[trio]
```

Changes: deduplicated `httpx`, added `aiosqlite` (SQLite async driver for test DB), added `anyio[trio]` (required by pytest-asyncio in newer versions), pinned SQLAlchemy to ≥2.0 (asyncio API is stable there).

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/requirements.txt
git commit -m "chore: add aiosqlite + anyio to backend deps for unit testing"
```

---

## Task 4: Backend test conftest.py

This is the foundation all backend tests build on. It creates an in-memory SQLite DB per test session, creates all tables, and provides an `AsyncClient` wired directly to the FastAPI app (no real HTTP port).

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create conftest.py**

```python
# backend/tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.models import Base
from app.db.session import get_db

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_run.db"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once for the test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture()
async def db_session():
    """Yield a fresh DB session per test, rolled back after."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture()
async def client(db_session: AsyncSession):
    """AsyncClient wired to the FastAPI app, overriding get_db."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Create pytest.ini at backend root**

```ini
# backend/pytest.ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/tests/conftest.py backend/pytest.ini
git commit -m "test: add async test conftest with SQLite in-memory DB and ASGI client"
```

---

## Task 5: Fix existing health test

The existing `tests/test_health.py` uses the old `AsyncClient(app=app, ...)` signature which is deprecated in httpx ≥0.24. Fix it to use the shared `client` fixture.

**Files:**
- Modify: `backend/tests/test_health.py`

- [ ] **Step 1: Rewrite test_health.py**

```python
# backend/tests/test_health.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_list_projects_empty(client: AsyncClient):
    r = await client.get("/api/v1/projects/")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/tests/test_health.py
git commit -m "test: fix health tests to use shared ASGI client fixture"
```

---

## Task 6: Backend project CRUD tests

**Files:**
- Create: `backend/tests/test_projects.py`

- [ ] **Step 1: Create test_projects.py**

```python
# backend/tests/test_projects.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient):
    payload = {"name": "Test Project", "description_markdown": "# Hello"}
    r = await client.post("/api/v1/projects/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Test Project"
    assert data["description_markdown"] == "# Hello"
    assert "id" in data
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_list_projects(client: AsyncClient):
    # create two projects
    await client.post("/api/v1/projects/", json={"name": "Alpha"})
    await client.post("/api/v1/projects/", json={"name": "Beta"})

    r = await client.get("/api/v1/projects/")
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "Alpha" in names
    assert "Beta" in names


@pytest.mark.asyncio
async def test_create_project_missing_name(client: AsyncClient):
    r = await client.post("/api/v1/projects/", json={"description_markdown": "No name"})
    assert r.status_code == 422  # validation error


@pytest.mark.asyncio
async def test_create_project_no_description(client: AsyncClient):
    r = await client.post("/api/v1/projects/", json={"name": "No Desc"})
    assert r.status_code == 200
    assert r.json()["name"] == "No Desc"
    assert r.json()["description_markdown"] is None
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/tests/test_projects.py
git commit -m "test: add project CRUD unit tests"
```

---

## Task 7: Backend feature CRUD tests

**Files:**
- Create: `backend/tests/test_features.py`

- [ ] **Step 1: Create test_features.py**

```python
# backend/tests/test_features.py
import pytest
from httpx import AsyncClient


async def _create_project(client: AsyncClient, name: str = "Proj") -> str:
    r = await client.post("/api/v1/projects/", json={"name": name})
    assert r.status_code == 200
    return r.json()["id"]


@pytest.mark.asyncio
async def test_create_feature(client: AsyncClient):
    project_id = await _create_project(client)
    r = await client.post(
        "/api/v1/features/",
        json={"name": "Login Page", "markdown_content": "## Details"},
        params={"project_id": project_id},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Login Page"
    assert data["project_id"] == project_id
    assert data["status"] == "todo"
    assert data["parent_id"] is None


@pytest.mark.asyncio
async def test_create_child_feature(client: AsyncClient):
    project_id = await _create_project(client, "ParentProj")
    parent_r = await client.post(
        "/api/v1/features/",
        json={"name": "Epic 1"},
        params={"project_id": project_id},
    )
    parent_id = parent_r.json()["id"]

    child_r = await client.post(
        "/api/v1/features/",
        json={"name": "Sub-feature 1", "parent_id": parent_id},
        params={"project_id": project_id},
    )
    assert child_r.status_code == 200
    assert child_r.json()["parent_id"] == parent_id


@pytest.mark.asyncio
async def test_get_feature(client: AsyncClient):
    project_id = await _create_project(client)
    create_r = await client.post(
        "/api/v1/features/",
        json={"name": "Feature A"},
        params={"project_id": project_id},
    )
    feature_id = create_r.json()["id"]

    r = await client.get(f"/api/v1/features/{feature_id}")
    assert r.status_code == 200
    assert r.json()["id"] == feature_id


@pytest.mark.asyncio
async def test_get_feature_not_found(client: AsyncClient):
    r = await client.get("/api/v1/features/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_features_by_project(client: AsyncClient):
    project_id = await _create_project(client, "ListProj")
    await client.post("/api/v1/features/", json={"name": "F1"}, params={"project_id": project_id})
    await client.post("/api/v1/features/", json={"name": "F2"}, params={"project_id": project_id})

    r = await client.get("/api/v1/features/", params={"project_id": project_id})
    assert r.status_code == 200
    names = [f["name"] for f in r.json()]
    assert "F1" in names
    assert "F2" in names


@pytest.mark.asyncio
async def test_update_feature_status(client: AsyncClient):
    project_id = await _create_project(client)
    create_r = await client.post(
        "/api/v1/features/",
        json={"name": "Feature B"},
        params={"project_id": project_id},
    )
    feature_id = create_r.json()["id"]

    r = await client.patch(
        f"/api/v1/features/{feature_id}",
        json={"status": "in_progress"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_feature_name_and_tags(client: AsyncClient):
    project_id = await _create_project(client)
    create_r = await client.post(
        "/api/v1/features/",
        json={"name": "Old Name"},
        params={"project_id": project_id},
    )
    feature_id = create_r.json()["id"]

    r = await client.patch(
        f"/api/v1/features/{feature_id}",
        json={"name": "New Name", "tags": ["auth", "ui"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "New Name"
    assert "auth" in data["tags"]


@pytest.mark.asyncio
async def test_update_feature_not_found(client: AsyncClient):
    r = await client.patch(
        "/api/v1/features/00000000-0000-0000-0000-000000000000",
        json={"status": "done"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_feature_missing_name(client: AsyncClient):
    project_id = await _create_project(client)
    r = await client.post(
        "/api/v1/features/",
        json={"markdown_content": "No name provided"},
        params={"project_id": project_id},
    )
    assert r.status_code == 422
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/tests/test_features.py
git commit -m "test: add feature CRUD unit tests"
```

---

## Task 8: Backend versions tests

**Files:**
- Create: `backend/tests/test_versions.py`

- [ ] **Step 1: Create test_versions.py**

```python
# backend/tests/test_versions.py
import pytest
from httpx import AsyncClient


async def _setup(client: AsyncClient):
    """Create a project + feature and return (project_id, feature_id)."""
    proj_r = await client.post("/api/v1/projects/", json={"name": "VersionProj"})
    project_id = proj_r.json()["id"]
    feat_r = await client.post(
        "/api/v1/features/",
        json={"name": "Versioned Feature", "markdown_content": "v0"},
        params={"project_id": project_id},
    )
    feature_id = feat_r.json()["id"]
    return project_id, feature_id


@pytest.mark.asyncio
async def test_create_first_version(client: AsyncClient):
    _, feature_id = await _setup(client)
    r = await client.post(
        f"/api/v1/features/{feature_id}/versions/",
        json={"content": "Version 1 content", "author_id": "user-abc"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == 1
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_version_increments(client: AsyncClient):
    _, feature_id = await _setup(client)
    await client.post(
        f"/api/v1/features/{feature_id}/versions/",
        json={"content": "v1"},
    )
    r2 = await client.post(
        f"/api/v1/features/{feature_id}/versions/",
        json={"content": "v2"},
    )
    assert r2.json()["version"] == 2


@pytest.mark.asyncio
async def test_list_versions_ordered(client: AsyncClient):
    _, feature_id = await _setup(client)
    for i in range(1, 4):
        await client.post(
            f"/api/v1/features/{feature_id}/versions/",
            json={"content": f"content {i}"},
        )

    r = await client.get(f"/api/v1/features/{feature_id}/versions/")
    assert r.status_code == 200
    versions = r.json()
    assert len(versions) == 3
    # Should be ordered descending (newest first)
    assert versions[0]["version"] == 3
    assert versions[-1]["version"] == 1


@pytest.mark.asyncio
async def test_create_version_updates_feature_content(client: AsyncClient):
    _, feature_id = await _setup(client)
    await client.post(
        f"/api/v1/features/{feature_id}/versions/",
        json={"content": "Updated markdown content"},
    )
    r = await client.get(f"/api/v1/features/{feature_id}")
    assert r.json()["markdown_content"] == "Updated markdown content"


@pytest.mark.asyncio
async def test_list_versions_empty(client: AsyncClient):
    _, feature_id = await _setup(client)
    r = await client.get(f"/api/v1/features/{feature_id}/versions/")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Fix versions.py to accept JSON body**

The current `versions.py` uses `content: str = Body(...)` which expects a bare string body, not JSON. Tests send `{"content": "...", "author_id": "..."}`. Fix the endpoint to use a Pydantic model.

Add to `backend/app/schemas.py`:
```python
class VersionCreate(BaseModel):
    content: str
    author_id: Optional[str] = None
```

Update `backend/app/api/v1/versions.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db import models
from app.schemas import VersionCreate
from uuid import UUID

router = APIRouter()


@router.post("/", response_model=dict)
async def create_version(
    feature_id: UUID,
    payload: VersionCreate,
    db: AsyncSession = Depends(get_db),
):
    # compute next version number
    from sqlalchemy import select, desc
    q = await db.execute(
        select(models.FeatureVersion)
        .where(models.FeatureVersion.feature_id == feature_id)
        .order_by(desc(models.FeatureVersion.version_number))
        .limit(1)
    )
    last = q.scalar_one_or_none()
    next_version = (last.version_number + 1) if last else 1

    fv = models.FeatureVersion(
        feature_id=feature_id,
        version_number=next_version,
        content_markdown=payload.content,
        author_id=payload.author_id,
    )
    db.add(fv)

    feature = await db.get(models.Feature, feature_id)
    if feature:
        feature.markdown_content = payload.content

    await db.commit()
    await db.refresh(fv)
    return {
        "id": str(fv.id),
        "version": fv.version_number,
        "created_at": fv.created_at.isoformat(),
    }


@router.get("/", response_model=list)
async def list_versions(feature_id: UUID, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select, desc
    q = await db.execute(
        select(models.FeatureVersion)
        .where(models.FeatureVersion.feature_id == feature_id)
        .order_by(desc(models.FeatureVersion.version_number))
    )
    rows = q.scalars().all()
    return [
        {
            "id": str(r.id),
            "version": r.version_number,
            "created_at": r.created_at.isoformat(),
            "author_id": r.author_id,
        }
        for r in rows
    ]
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/tests/test_versions.py backend/app/schemas.py backend/app/api/v1/versions.py
git commit -m "test: add version unit tests; fix versions endpoint to use JSON body"
```

---

## Task 9: Fix SQLite compatibility in models

SQLite doesn't support `ARRAY` type. The `Feature.tags` column uses `sa.ARRAY(sa.String)` which fails on SQLite (used in tests). Fix it to use `JSON` which works on both SQLite and PostgreSQL.

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Update models.py — change tags column type**

Replace the full `models.py` with this corrected version:

```python
# backend/app/db/models.py
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, relationship
import uuid
from datetime import datetime

Base = declarative_base()


def _uuid_col(**kw):
    """UUID column that works on both PostgreSQL and SQLite."""
    return sa.Column(sa.String(36), default=lambda: str(uuid.uuid4()), **kw)


class Project(Base):
    __tablename__ = "projects"
    id = _uuid_col(primary_key=True)
    name = sa.Column(sa.String, nullable=False)
    description_markdown = sa.Column(sa.Text, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="active")
    metadata_json = sa.Column("metadata", sa.JSON, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    features = relationship("Feature", back_populates="project")


class Feature(Base):
    __tablename__ = "features"
    id = _uuid_col(primary_key=True)
    project_id = sa.Column(sa.String(36), sa.ForeignKey("projects.id"), nullable=False)
    parent_id = sa.Column(sa.String(36), sa.ForeignKey("features.id"), nullable=True)

    name = sa.Column(sa.String, nullable=False)
    markdown_content = sa.Column(sa.Text, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="todo")
    priority = sa.Column(sa.String, nullable=True)
    tags = sa.Column(sa.JSON, nullable=True)   # was ARRAY(String) — JSON works on SQLite + PG
    position = sa.Column(sa.Integer, default=0)

    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="features")


class FeatureVersion(Base):
    __tablename__ = "feature_versions"
    id = _uuid_col(primary_key=True)
    feature_id = sa.Column(sa.String(36), sa.ForeignKey("features.id"), nullable=False)
    version_number = sa.Column(sa.Integer, nullable=False, default=1)
    content_markdown = sa.Column(sa.Text, nullable=False)
    author_id = sa.Column(sa.String, nullable=True)
    commit_message = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    feature = relationship("Feature")
```

> **Why:** `sa.ARRAY` is PostgreSQL-specific. `sa.JSON` stores lists as JSON arrays on both PostgreSQL and SQLite, so the value `["auth", "ui"]` round-trips correctly on both engines.

- [ ] **Step 2: Update schemas.py — tags type change**

In `backend/app/schemas.py`, change `tags: Optional[List[str]]` to `tags: Optional[list] = None` in `Feature` and `FeatureUpdate`. The JSON column returns a plain list regardless of engine.

```python
# backend/app/schemas.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class ProjectBase(BaseModel):
    name: str
    description_markdown: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class Project(ProjectBase):
    id: str
    status: str
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FeatureBase(BaseModel):
    name: str
    markdown_content: Optional[str] = None


class FeatureCreate(FeatureBase):
    parent_id: Optional[str] = None


class FeatureUpdate(BaseModel):
    name: Optional[str] = None
    markdown_content: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[list] = None
    position: Optional[int] = None


class Feature(FeatureBase):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    status: str
    tags: Optional[list] = None
    position: Optional[int] = None

    class Config:
        from_attributes = True


class VersionCreate(BaseModel):
    content: str
    author_id: Optional[str] = None
```

> Note: IDs changed from `UUID` to `str` — SQLite stores UUIDs as plain strings; `str` type works on both engines. The `orm_mode = True` config key is renamed to `from_attributes = True` in Pydantic v2.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add backend/app/db/models.py backend/app/schemas.py
git commit -m "fix: use JSON for tags column and str for UUIDs for SQLite/PG compatibility"
```

---

## Task 10: Run all backend tests locally

- [ ] **Step 1: Install deps and run tests**

```bash
cd /Volumes/Data/develop/feature-flow/backend
pip install -r requirements.txt
pytest tests/ -v --tb=short
```

Expected output (all green):
```
tests/test_health.py::test_health PASSED
tests/test_health.py::test_list_projects_empty PASSED
tests/test_projects.py::test_create_project PASSED
tests/test_projects.py::test_list_projects PASSED
tests/test_projects.py::test_create_project_missing_name PASSED
tests/test_projects.py::test_create_project_no_description PASSED
tests/test_features.py::test_create_feature PASSED
tests/test_features.py::test_create_child_feature PASSED
tests/test_features.py::test_get_feature PASSED
tests/test_features.py::test_get_feature_not_found PASSED
tests/test_features.py::test_list_features_by_project PASSED
tests/test_features.py::test_update_feature_status PASSED
tests/test_features.py::test_update_feature_name_and_tags PASSED
tests/test_features.py::test_update_feature_not_found PASSED
tests/test_features.py::test_create_feature_missing_name PASSED
tests/test_versions.py::test_create_first_version PASSED
tests/test_versions.py::test_version_increments PASSED
tests/test_versions.py::test_list_versions_ordered PASSED
tests/test_versions.py::test_create_version_updates_feature_content PASSED
tests/test_versions.py::test_list_versions_empty PASSED
===== 20 passed in X.XXs =====
```

If any test fails, fix the root cause before proceeding.

- [ ] **Step 2: Commit clean test run marker**

```bash
cd /Volumes/Data/develop/feature-flow
git add -A
git commit -m "test: all 20 backend unit tests passing"
```

---

## Task 11: Add frontend Vitest setup

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Vitest and testing-library**

```bash
cd /Volumes/Data/develop/feature-flow/frontend
npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test config to vite.config.ts**

Read the current `vite.config.ts` first, then add the `test` block. The full file should look like:

```typescript
// frontend/vite.config.ts  — add test block to existing config
import { defineConfig } from "vite";
// ... existing imports stay as-is ...

export default defineConfig({
  // ... existing config stays as-is ...
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 3: Create src/test-setup.ts**

```typescript
// frontend/src/test-setup.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Add test scripts to package.json**

Add to the `"scripts"` section:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add frontend/vite.config.ts frontend/package.json frontend/src/test-setup.ts
git commit -m "chore: add Vitest test runner to frontend"
```

---

## Task 12: Frontend store unit tests

**Files:**
- Create: `frontend/src/lib/__tests__/store.test.ts`

- [ ] **Step 1: Create store.test.ts**

```typescript
// frontend/src/lib/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useStore, labelStatus, labelPriority, labelRelation } from "../store";

// Helper: reset store state before each test
beforeEach(() => {
  useStore.setState({
    features: [],
    relations: [],
    history: [],
    seededProjectIds: new Set(),
  });
});

const PROJECT_ID = "proj-test-1";

describe("createFeature", () => {
  it("creates a feature with required fields", () => {
    const f = useStore.getState().createFeature({ name: "Login", projectId: PROJECT_ID });
    expect(f.name).toBe("Login");
    expect(f.projectId).toBe(PROJECT_ID);
    expect(f.status).toBe("todo");
    expect(f.priority).toBe("medium");
    expect(f.parentId).toBeNull();
    expect(f.tags).toEqual([]);
  });

  it("creates a feature with custom status and priority", () => {
    const f = useStore.getState().createFeature({
      name: "Critical Bug",
      projectId: PROJECT_ID,
      status: "in_progress",
      priority: "critical",
    });
    expect(f.status).toBe("in_progress");
    expect(f.priority).toBe("critical");
  });

  it("creates a child feature with parentId", () => {
    const parent = useStore.getState().createFeature({ name: "Epic", projectId: PROJECT_ID });
    const child = useStore.getState().createFeature({
      name: "Sub",
      projectId: PROJECT_ID,
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  it("adds a history entry on creation", () => {
    const f = useStore.getState().createFeature({ name: "Feature X", projectId: PROJECT_ID });
    const history = useStore.getState().getHistory(f.id);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].action).toContain("Created");
  });

  it("assigns incrementing order values", () => {
    const f1 = useStore.getState().createFeature({ name: "F1", projectId: PROJECT_ID });
    const f2 = useStore.getState().createFeature({ name: "F2", projectId: PROJECT_ID });
    expect(f2.order).toBeGreaterThan(f1.order);
  });
});

describe("updateFeature", () => {
  it("updates name and logs history", () => {
    const f = useStore.getState().createFeature({ name: "Old", projectId: PROJECT_ID });
    useStore.getState().updateFeature(f.id, { name: "New" });
    const updated = useStore.getState().getFeature(f.id);
    expect(updated?.name).toBe("New");
    const history = useStore.getState().getHistory(f.id);
    const rename = history.find((h) => h.action.includes("Renamed"));
    expect(rename).toBeDefined();
  });

  it("updates status and logs history", () => {
    const f = useStore.getState().createFeature({ name: "F", projectId: PROJECT_ID });
    useStore.getState().updateFeature(f.id, { status: "done" });
    const history = useStore.getState().getHistory(f.id);
    const statusChange = history.find((h) => h.action.includes("status"));
    expect(statusChange).toBeDefined();
    expect(statusChange?.action).toContain("Done");
  });

  it("does nothing for unknown id", () => {
    const before = useStore.getState().features.length;
    useStore.getState().updateFeature("nonexistent", { name: "X" });
    expect(useStore.getState().features.length).toBe(before);
  });
});

describe("deleteFeature", () => {
  it("deletes a feature and its children", () => {
    const parent = useStore.getState().createFeature({ name: "Parent", projectId: PROJECT_ID });
    const child = useStore.getState().createFeature({
      name: "Child",
      projectId: PROJECT_ID,
      parentId: parent.id,
    });
    useStore.getState().deleteFeature(parent.id);
    expect(useStore.getState().getFeature(parent.id)).toBeUndefined();
    expect(useStore.getState().getFeature(child.id)).toBeUndefined();
  });

  it("removes associated relations when feature is deleted", () => {
    const f1 = useStore.getState().createFeature({ name: "F1", projectId: PROJECT_ID });
    const f2 = useStore.getState().createFeature({ name: "F2", projectId: PROJECT_ID });
    useStore.getState().addRelation(f1.id, f2.id, "depends_on");
    useStore.getState().deleteFeature(f1.id);
    expect(useStore.getState().relations.length).toBe(0);
  });
});

describe("duplicateFeature", () => {
  it("creates a copy with (copy) suffix", () => {
    const f = useStore.getState().createFeature({ name: "Original", projectId: PROJECT_ID });
    const copy = useStore.getState().duplicateFeature(f.id);
    expect(copy?.name).toBe("Original (copy)");
    expect(copy?.projectId).toBe(PROJECT_ID);
  });

  it("returns null for unknown id", () => {
    const result = useStore.getState().duplicateFeature("nonexistent");
    expect(result).toBeNull();
  });
});

describe("moveFeature", () => {
  it("updates parentId of the moved feature", () => {
    const parent = useStore.getState().createFeature({ name: "Parent", projectId: PROJECT_ID });
    const child = useStore.getState().createFeature({ name: "Child", projectId: PROJECT_ID });
    useStore.getState().moveFeature(child.id, parent.id);
    expect(useStore.getState().getFeature(child.id)?.parentId).toBe(parent.id);
  });

  it("can move feature to root (null parent)", () => {
    const parent = useStore.getState().createFeature({ name: "Parent", projectId: PROJECT_ID });
    const child = useStore.getState().createFeature({
      name: "Child",
      projectId: PROJECT_ID,
      parentId: parent.id,
    });
    useStore.getState().moveFeature(child.id, null);
    expect(useStore.getState().getFeature(child.id)?.parentId).toBeNull();
  });
});

describe("relations", () => {
  it("adds a relation between two features", () => {
    const f1 = useStore.getState().createFeature({ name: "F1", projectId: PROJECT_ID });
    const f2 = useStore.getState().createFeature({ name: "F2", projectId: PROJECT_ID });
    useStore.getState().addRelation(f1.id, f2.id, "blocks");
    const rels = useStore.getState().getRelations(f1.id);
    expect(rels.length).toBe(1);
    expect(rels[0].type).toBe("blocks");
  });

  it("prevents self-relation", () => {
    const f = useStore.getState().createFeature({ name: "F", projectId: PROJECT_ID });
    useStore.getState().addRelation(f.id, f.id, "related_to");
    expect(useStore.getState().getRelations(f.id).length).toBe(0);
  });

  it("removes a relation by id", () => {
    const f1 = useStore.getState().createFeature({ name: "F1", projectId: PROJECT_ID });
    const f2 = useStore.getState().createFeature({ name: "F2", projectId: PROJECT_ID });
    useStore.getState().addRelation(f1.id, f2.id, "related_to");
    const relId = useStore.getState().relations[0].id;
    useStore.getState().removeRelation(relId);
    expect(useStore.getState().relations.length).toBe(0);
  });
});

describe("getTree", () => {
  it("returns root features only at top level", () => {
    const root = useStore.getState().createFeature({ name: "Root", projectId: PROJECT_ID });
    useStore.getState().createFeature({
      name: "Child",
      projectId: PROJECT_ID,
      parentId: root.id,
    });
    const tree = useStore.getState().getTree(PROJECT_ID);
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe(root.id);
    expect(tree[0].children.length).toBe(1);
  });
});

describe("getBreadcrumb", () => {
  it("returns full ancestor chain", () => {
    const grandparent = useStore.getState().createFeature({ name: "GP", projectId: PROJECT_ID });
    const parent = useStore.getState().createFeature({
      name: "Parent",
      projectId: PROJECT_ID,
      parentId: grandparent.id,
    });
    const child = useStore.getState().createFeature({
      name: "Child",
      projectId: PROJECT_ID,
      parentId: parent.id,
    });
    const crumb = useStore.getState().getBreadcrumb(child.id);
    expect(crumb.map((f) => f.name)).toEqual(["GP", "Parent", "Child"]);
  });
});

describe("removeProjectData", () => {
  it("removes all features and relations for a project", () => {
    const f = useStore.getState().createFeature({ name: "F", projectId: PROJECT_ID });
    useStore.getState().createFeature({ name: "F2", projectId: PROJECT_ID });
    useStore.getState().addRelation(f.id, f.id + "x", "blocks");
    useStore.getState().removeProjectData(PROJECT_ID);
    expect(useStore.getState().getProjectFeatures(PROJECT_ID).length).toBe(0);
    expect(useStore.getState().relations.length).toBe(0);
  });
});

describe("label helpers", () => {
  it("labelStatus returns display strings", () => {
    expect(labelStatus("todo")).toBe("Todo");
    expect(labelStatus("in_progress")).toBe("In Progress");
    expect(labelStatus("done")).toBe("Done");
    expect(labelStatus("deprecated")).toBe("Deprecated");
  });

  it("labelPriority returns display strings", () => {
    expect(labelPriority("low")).toBe("Low");
    expect(labelPriority("critical")).toBe("Critical");
  });

  it("labelRelation returns display strings", () => {
    expect(labelRelation("depends_on")).toBe("Depends on");
    expect(labelRelation("blocks")).toBe("Blocks");
  });
});
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add frontend/src/lib/__tests__/store.test.ts frontend/src/test-setup.ts
git commit -m "test: add comprehensive Zustand store unit tests (30 cases)"
```

---

## Task 13: Run all frontend tests

- [ ] **Step 1: Run Vitest**

```bash
cd /Volumes/Data/develop/feature-flow/frontend
npm run test:run
```

Expected output:
```
 ✓ src/lib/__tests__/store.test.ts (30 tests) Xms
 Test Files  1 passed (1)
 Tests       30 passed (30)
```

If tests fail, fix them. Common issues:
- `useStore.setState` not resetting `seededProjectIds` as a `Set` → ensure the `beforeEach` passes `new Set()` not `[]`
- Import path issues → check `@/lib/store` resolves via `vite-tsconfig-paths`

- [ ] **Step 2: Final commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add -A
git commit -m "test: all frontend store unit tests passing"
```

---

## Task 14: Run full stack via docker compose

- [ ] **Step 1: Build and start all services**

```bash
cd /Volumes/Data/develop/feature-flow
docker compose build
docker compose up -d db backend
```

Wait for backend healthcheck:
```bash
docker compose logs backend --follow
```
Expected: `Application startup complete.`

- [ ] **Step 2: Run backend tests inside Docker**

```bash
docker compose run --rm test
```

Expected: all 20 tests pass inside the container.

- [ ] **Step 3: Start frontend**

```bash
docker compose up -d frontend
```

Check it's running:
```bash
docker compose ps
```
Expected: `db`, `backend`, `frontend` all `running`.

- [ ] **Step 4: Final commit**

```bash
cd /Volumes/Data/develop/feature-flow
git add -A
git commit -m "feat: full docker compose stack with backend + frontend + test runner"
```

---

## Self-Review

**Spec coverage:**
- ✅ `docker-compose.yml` at repo root — Task 1
- ✅ Frontend Dockerfile — Task 2
- ✅ Backend tests for health, projects, features, versions — Tasks 5–8
- ✅ Frontend Vitest setup — Task 11
- ✅ Frontend store unit tests — Task 12
- ✅ Run all tests — Tasks 10, 13, 14

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `VersionCreate` schema defined in Task 8 Step 2 and used in `versions.py` in the same step ✅
- `_uuid_col` helper defined and used consistently in Task 9 ✅
- `from_attributes = True` (Pydantic v2) used consistently in schemas ✅
- `ASGITransport` used in conftest (Task 4) and referenced correctly in test files ✅
