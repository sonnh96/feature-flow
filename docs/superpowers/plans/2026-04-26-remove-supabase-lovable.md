# Remove Supabase & Lovable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Supabase and Lovable dependencies from the frontend, replace with JWT auth + RBAC + image uploads on the backend, and swap the frontend to use backend API calls exclusively.

**Architecture:** Backend-first approach. Build JWT auth, RBAC tables, role management endpoints, and image upload on the FastAPI backend (Tasks 1–10). Then swap the frontend to use localStorage-based JWT tokens and backend API calls instead of Supabase SDK (Tasks 11–17). Alembic migration adds RBAC tables and seeds default roles/permissions.

**Tech Stack:** FastAPI, SQLAlchemy async, python-jose (JWT), passlib (bcrypt), python-multipart (file uploads), TanStack Start (React), Zustand, localStorage for token storage.

---

### Task 1: Add backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add new dependencies to requirements.txt**

Add `python-jose[cryptography]`, `passlib[bcrypt]`, and `python-multipart` to `backend/requirements.txt`:

```
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
python-jose[cryptography]
passlib[bcrypt]
python-multipart
pytest
pytest-asyncio
```

- [ ] **Step 2: Install dependencies**

Run: `cd backend && pip install -r requirements.txt`
Expected: All packages install successfully, including `python-jose`, `passlib`, and `python-multipart`.

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add JWT, bcrypt, and multipart dependencies"
```

---

### Task 2: Update config — remove Supabase settings, add JWT settings

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_config.py`:

```python
import os
import pytest


def test_settings_has_jwt_fields():
    """Settings class must expose secret_key, access/refresh token expiry."""
    from app.core.config import Settings

    s = Settings(
        database_url="sqlite+aiosqlite:///test.db",
        secret_key="test-secret-key-at-least-32-chars-long",
    )
    assert s.secret_key == "test-secret-key-at-least-32-chars-long"
    assert s.access_token_expire_minutes == 30
    assert s.refresh_token_expire_days == 7
    assert not hasattr(s, "supabase_url")
    assert not hasattr(s, "supabase_service_role_key")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config.py::test_settings_has_jwt_fields -v`
Expected: FAIL — `supabase_url` still present, `secret_key` not defined.

- [ ] **Step 3: Update config.py**

Replace `backend/app/core/config.py` with:

```python
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/featuredb"
    secret_key: str = secrets.token_urlsafe(32)
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7


settings = Settings()
```

- [ ] **Step 4: Add SECRET_KEY to backend .env**

Add to `backend/.env`:

```
SECRET_KEY=dev-secret-key-change-in-production-please
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_config.py::test_settings_has_jwt_fields -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/config.py backend/.env backend/tests/test_config.py
git commit -m "feat: replace Supabase config with JWT settings"
```

---

### Task 3: Add RBAC models (Role, Permission, association tables) and update User model

**Files:**
- Modify: `backend/app/db/models.py`

The existing `User` model at `models.py:249-260` has a `role` string field and no `hashed_password`. We need to:
1. Add `hashed_password` column to User
2. Replace `role` string with RBAC relationship (through `user_roles` join table)
3. Add `display_name` is already there — keep it
4. Add `Role`, `Permission` models and `user_roles`, `role_permissions` association tables

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rbac_models.py`:

```python
import uuid
from datetime import datetime

import pytest
import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, User, Role, Permission, user_roles, role_permissions


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_user_has_hashed_password_column(db):
    user = User(
        email="test@example.com",
        hashed_password="fakehash123",
        display_name="Test User",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    assert user.hashed_password == "fakehash123"
    assert user.email == "test@example.com"


@pytest.mark.asyncio
async def test_role_and_permission_models(db):
    perm = Permission(resource="project", action="create")
    db.add(perm)
    await db.flush()

    role = Role(name="editor", description="Can edit")
    role.permissions.append(perm)
    db.add(role)
    await db.flush()

    user = User(email="u@x.com", hashed_password="hash")
    user.roles.append(role)
    db.add(user)
    await db.commit()

    # Reload and check relationships
    result = await db.execute(
        select(User).where(User.email == "u@x.com")
    )
    loaded_user = result.scalar_one()
    assert len(loaded_user.roles) == 1
    assert loaded_user.roles[0].name == "editor"
    assert len(loaded_user.roles[0].permissions) == 1
    assert loaded_user.roles[0].permissions[0].resource == "project"
    assert loaded_user.roles[0].permissions[0].action == "create"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_rbac_models.py -v`
Expected: FAIL — `User` has no `hashed_password`, `Role` and `Permission` don't exist.

- [ ] **Step 3: Add RBAC models and update User model**

In `backend/app/db/models.py`, add the association tables after the existing `feature_tags` table (after line 62):

```python
user_roles = sa.Table(
    "user_roles",
    Base.metadata,
    sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("role_id", GUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
)

role_permissions = sa.Table(
    "role_permissions",
    Base.metadata,
    sa.Column("role_id", GUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("permission_id", GUID(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)
```

Add the `Role` and `Permission` models before the existing `User` class:

```python
class Role(Base):
    __tablename__ = "roles"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = sa.Column(sa.String(50), unique=True, nullable=False)
    description = sa.Column(sa.String(255), nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles", lazy="selectin")


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    resource = sa.Column(sa.String(50), nullable=False)
    action = sa.Column(sa.String(50), nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
```

Update the existing `User` class (`models.py:249-260`) to add `hashed_password` and RBAC relationship:

```python
class User(Base):
    __tablename__ = "users"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = sa.Column(sa.String, nullable=False, unique=True, index=True)
    hashed_password = sa.Column(sa.String, nullable=False, default="")
    display_name = sa.Column(sa.String, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="active")
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")
    roles = relationship("Role", secondary=user_roles, back_populates="users", lazy="selectin")
```

Note: We remove the old `role` string column and replace it with the `roles` relationship. The `status` field is kept (it was "active"/"inactive" — serves as `is_active`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_rbac_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/tests/test_rbac_models.py
git commit -m "feat: add RBAC models (Role, Permission) and update User with hashed_password"
```

---

### Task 4: Rewrite security module — JWT + bcrypt + get_current_user

**Files:**
- Modify: `backend/app/core/security.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_security.py`:

```python
import pytest
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token


def test_hash_and_verify_password():
    hashed = hash_password("mysecretpass")
    assert hashed != "mysecretpass"
    assert verify_password("mysecretpass", hashed) is True
    assert verify_password("wrongpass", hashed) is False


def test_create_and_decode_access_token():
    token = create_access_token(user_id="user-123", email="a@b.com", roles=["editor"])
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["email"] == "a@b.com"
    assert payload["roles"] == ["editor"]
    assert payload["type"] == "access"


def test_create_and_decode_refresh_token():
    token = create_refresh_token(user_id="user-456")
    payload = decode_token(token)
    assert payload["sub"] == "user-456"
    assert payload["type"] == "refresh"


def test_decode_invalid_token_raises():
    with pytest.raises(Exception):
        decode_token("not.a.valid.token")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_security.py -v`
Expected: FAIL — functions don't exist yet.

- [ ] **Step 3: Rewrite security.py**

Replace `backend/app/core/security.py` with:

```python
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, email: str, roles: list[str]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "roles": roles,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models import User, Role

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_security.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat: rewrite security module with JWT + bcrypt, remove Supabase token verification"
```

---

### Task 5: Add auth and RBAC schemas

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_schemas.py`:

```python
from uuid import uuid4

from app.schemas import UserRegister, UserLogin, TokenResponse, TokenRefresh, UserResponse, RoleResponse, PermissionResponse


def test_user_register_schema():
    u = UserRegister(email="a@b.com", password="secret123")
    assert u.email == "a@b.com"
    assert u.password == "secret123"


def test_token_response_schema():
    t = TokenResponse(access_token="abc", refresh_token="def")
    assert t.token_type == "bearer"


def test_user_response_schema():
    uid = uuid4()
    u = UserResponse(
        id=uid,
        email="a@b.com",
        display_name="Test",
        status="active",
        created_at="2026-01-01T00:00:00",
        roles=[],
    )
    assert u.status == "active"
    assert u.roles == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth_schemas.py -v`
Expected: FAIL — `UserRegister`, `TokenResponse`, etc. don't exist.

- [ ] **Step 3: Add auth schemas to schemas.py**

Append the following to `backend/app/schemas.py`:

```python
# ── Auth & RBAC schemas ──


class UserRegister(ApiModel):
    email: str
    password: str
    display_name: Optional[str] = None


class UserLogin(ApiModel):
    email: str
    password: str


class TokenResponse(ApiModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(ApiModel):
    refresh_token: str


class PermissionResponse(ApiModel):
    id: UUID
    resource: str
    action: str


class RoleResponse(ApiModel):
    id: UUID
    name: str
    description: Optional[str] = None
    permissions: list[PermissionResponse] = []


class UserResponse(ApiModel):
    id: UUID
    email: str
    display_name: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    roles: list[RoleResponse] = []


class RoleAssign(ApiModel):
    user_id: UUID
    role_name: str


class RoleCreate(ApiModel):
    name: str
    description: Optional[str] = None


class PermissionAssign(ApiModel):
    role_name: str
    resource: str
    action: str
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_auth_schemas.py
git commit -m "feat: add auth and RBAC Pydantic schemas"
```

---

### Task 6: Create RBAC utilities (require_permission, require_role)

**Files:**
- Create: `backend/app/core/rbac.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rbac.py`:

```python
import pytest
from unittest.mock import MagicMock
from app.core.rbac import check_permission, check_role


def _make_user(roles_data: list[dict]):
    """Build a mock user with roles and permissions."""
    user = MagicMock()
    roles = []
    for rd in roles_data:
        role = MagicMock()
        role.name = rd["name"]
        perms = []
        for p in rd.get("permissions", []):
            pm = MagicMock()
            pm.resource = p[0]
            pm.action = p[1]
            perms.append(pm)
        role.permissions = perms
        roles.append(role)
    user.roles = roles
    return user


def test_check_permission_passes():
    user = _make_user([{"name": "editor", "permissions": [("project", "create"), ("project", "read")]}])
    assert check_permission(user, "project", "create") is True


def test_check_permission_fails():
    user = _make_user([{"name": "viewer", "permissions": [("project", "read")]}])
    assert check_permission(user, "project", "create") is False


def test_check_role_passes():
    user = _make_user([{"name": "admin", "permissions": []}])
    assert check_role(user, "admin") is True


def test_check_role_fails():
    user = _make_user([{"name": "viewer", "permissions": []}])
    assert check_role(user, "admin") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_rbac.py -v`
Expected: FAIL — `app.core.rbac` doesn't exist.

- [ ] **Step 3: Create rbac.py**

Create `backend/app/core/rbac.py`:

```python
from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user


def check_permission(user, resource: str, action: str) -> bool:
    """Check if user has a specific permission via any of their roles."""
    for role in user.roles:
        for perm in role.permissions:
            if perm.resource == resource and perm.action == action:
                return True
    return False


def check_role(user, role_name: str) -> bool:
    """Check if user has a specific role."""
    return any(r.name == role_name for r in user.roles)


def require_permission(resource: str, action: str):
    """FastAPI dependency factory. Checks the current user has the specified permission.

    Usage:
        @router.post("/", dependencies=[Depends(require_permission("project", "create"))])
    Or:
        async def endpoint(user = Depends(require_permission("project", "create"))):
    """
    async def checker(current_user=Depends(get_current_user)):
        if not check_permission(current_user, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires {resource}.{action}",
            )
        return current_user
    return checker


def require_role(role_name: str):
    """FastAPI dependency factory. Checks the current user has a specific role."""
    async def checker(current_user=Depends(get_current_user)):
        if not check_role(current_user, role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires role '{role_name}'",
            )
        return current_user
    return checker
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_rbac.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/rbac.py backend/tests/test_rbac.py
git commit -m "feat: add RBAC utilities (require_permission, require_role)"
```

---

### Task 7: Create auth endpoints (register, login, refresh, me)

**Files:**
- Create: `backend/app/api/v1/auth.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_endpoints.py`:

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.session import get_db
from app.main import app


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_first_user_gets_admin(client):
    # Need to seed roles/permissions first
    from app.db.session import get_db as real_get_db
    from app.api.v1.auth import seed_default_roles
    db_session = None
    async for s in app.dependency_overrides[real_get_db]():
        db_session = s
    if db_session:
        await seed_default_roles(db_session)

    resp = await client.post("/api/v1/auth/register", json={
        "email": "admin@test.com",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_success(client):
    from app.api.v1.auth import seed_default_roles
    db_session = None
    async for s in app.dependency_overrides[get_db]():
        db_session = s
    if db_session:
        await seed_default_roles(db_session)

    # Register first
    await client.post("/api/v1/auth/register", json={
        "email": "user@test.com",
        "password": "mypassword",
    })
    # Login
    resp = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com",
        "password": "mypassword",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    from app.api.v1.auth import seed_default_roles
    db_session = None
    async for s in app.dependency_overrides[get_db]():
        db_session = s
    if db_session:
        await seed_default_roles(db_session)

    await client.post("/api/v1/auth/register", json={
        "email": "user2@test.com",
        "password": "correct",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "user2@test.com",
        "password": "wrong",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(client):
    from app.api.v1.auth import seed_default_roles
    db_session = None
    async for s in app.dependency_overrides[get_db]():
        db_session = s
    if db_session:
        await seed_default_roles(db_session)

    reg = await client.post("/api/v1/auth/register", json={
        "email": "me@test.com",
        "password": "password123",
    })
    token = reg.json()["access_token"]
    resp = await client.get("/api/v1/auth/me", headers={
        "Authorization": f"Bearer {token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "me@test.com"
    assert len(data["roles"]) > 0


@pytest.mark.asyncio
async def test_me_without_token(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client):
    from app.api.v1.auth import seed_default_roles
    db_session = None
    async for s in app.dependency_overrides[get_db]():
        db_session = s
    if db_session:
        await seed_default_roles(db_session)

    reg = await client.post("/api/v1/auth/register", json={
        "email": "refresh@test.com",
        "password": "password123",
    })
    refresh_token = reg.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth_endpoints.py -v`
Expected: FAIL — `app.api.v1.auth` doesn't exist.

- [ ] **Step 3: Create auth.py**

Create `backend/app/api/v1/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db import models
from app.db.session import get_db
from app.schemas import (
    TokenRefresh,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    PermissionResponse,
    RoleResponse,
)

router = APIRouter()

# Default permissions to seed
DEFAULT_PERMISSIONS = [
    ("project", "create"), ("project", "read"), ("project", "update"), ("project", "delete"),
    ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
    ("version", "create"), ("version", "read"), ("version", "delete"),
    ("upload", "create"),
    ("user", "read"), ("user", "update"), ("user", "delete"),
    ("role", "create"), ("role", "read"), ("role", "update"), ("role", "delete"),
]

# Default roles and which permissions they get
DEFAULT_ROLES = {
    "admin": None,  # None means ALL permissions
    "editor": [
        ("project", "create"), ("project", "read"), ("project", "update"),
        ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
        ("version", "create"), ("version", "read"), ("version", "delete"),
        ("upload", "create"),
    ],
    "viewer": [
        ("project", "read"), ("feature", "read"), ("version", "read"),
    ],
}


async def seed_default_roles(db: AsyncSession) -> None:
    """Seed default roles and permissions if they don't exist yet."""
    # Check if roles already seeded
    result = await db.execute(select(func.count()).select_from(models.Role))
    if result.scalar() > 0:
        return

    # Create permissions
    perm_map: dict[tuple[str, str], models.Permission] = {}
    for resource, action in DEFAULT_PERMISSIONS:
        perm = models.Permission(resource=resource, action=action)
        db.add(perm)
        perm_map[(resource, action)] = perm
    await db.flush()

    # Create roles with permissions
    for role_name, role_perms in DEFAULT_ROLES.items():
        role = models.Role(
            name=role_name,
            description=f"Default {role_name} role",
        )
        if role_perms is None:
            # Admin gets all permissions
            role.permissions = list(perm_map.values())
        else:
            role.permissions = [perm_map[key] for key in role_perms if key in perm_map]
        db.add(role)

    await db.commit()


def _user_to_response(user: models.User) -> dict:
    """Convert a User model to a UserResponse-compatible dict."""
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "roles": [
            {
                "id": str(role.id),
                "name": role.name,
                "description": role.description,
                "permissions": [
                    {"id": str(p.id), "resource": p.resource, "action": p.action}
                    for p in role.permissions
                ],
            }
            for role in user.roles
        ],
    }


@router.post("/register", response_model=TokenResponse)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    # Ensure default roles exist
    await seed_default_roles(db)

    # Check for existing user
    result = await db.execute(
        select(models.User).where(models.User.email == payload.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Determine role: first user gets admin, others get editor
    user_count = await db.execute(select(func.count()).select_from(models.User))
    is_first_user = user_count.scalar() == 0

    # Create user
    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    await db.flush()

    # Assign role
    default_role_name = "admin" if is_first_user else "editor"
    role_result = await db.execute(
        select(models.Role).where(models.Role.name == default_role_name)
    )
    role = role_result.scalar_one_or_none()
    if role:
        user.roles.append(role)

    await db.commit()
    await db.refresh(user)

    role_names = [r.name for r in user.roles]
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.email, role_names),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.User)
        .options(selectinload(models.User.roles))
        .where(models.User.email == payload.email)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    role_names = [r.name for r in user.roles]
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.email, role_names),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: TokenRefresh, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(payload.refresh_token)
    if token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = token_data.get("sub")
    result = await db.execute(
        select(models.User)
        .options(selectinload(models.User.roles))
        .where(models.User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    role_names = [r.name for r in user.roles]
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.email, role_names),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me")
async def me(current_user: models.User = Depends(get_current_user)):
    return _user_to_response(current_user)
```

- [ ] **Step 4: Update __init__.py to export auth_router**

In `backend/app/api/v1/__init__.py`, add:

```python
from .auth import router as auth_router
```

And update `__all__`:

```python
__all__ = ["projects_router", "features_router", "versions_router", "search_router", "auth_router"]
```

- [ ] **Step 5: Register auth router in main.py**

In `backend/app/main.py`, add the import and router registration:

```python
from app.api.v1 import projects_router, features_router, versions_router, search_router, auth_router
```

And add:

```python
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth_endpoints.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/auth.py backend/app/api/v1/__init__.py backend/app/main.py backend/tests/test_auth_endpoints.py
git commit -m "feat: add auth endpoints (register, login, refresh, me) with RBAC role assignment"
```

---

### Task 8: Create role management endpoints (admin only)

**Files:**
- Create: `backend/app/api/v1/roles.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_roles_endpoints.py`:

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.session import get_db
from app.main import app
from app.api.v1.auth import seed_default_roles


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def register_admin(client) -> str:
    """Register first user (gets admin) and return access token."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "admin@test.com",
        "password": "adminpass",
    })
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_list_roles(client):
    token = await register_admin(client)
    resp = await client.get("/api/v1/roles", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    roles = resp.json()
    role_names = {r["name"] for r in roles}
    assert "admin" in role_names
    assert "editor" in role_names
    assert "viewer" in role_names


@pytest.mark.asyncio
async def test_list_users(client):
    token = await register_admin(client)
    resp = await client.get("/api/v1/roles/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    users = resp.json()
    assert len(users) >= 1
    assert users[0]["email"] == "admin@test.com"


@pytest.mark.asyncio
async def test_assign_role(client):
    token = await register_admin(client)
    # Register a second user
    reg = await client.post("/api/v1/auth/register", json={
        "email": "user@test.com",
        "password": "userpass",
    })
    user_id = None
    # Get user ID from /me
    user_token = reg.json()["access_token"]
    me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    user_id = me_resp.json()["id"]

    # Assign viewer role to user
    resp = await client.post("/api/v1/roles/assign", json={
        "user_id": user_id,
        "role_name": "viewer",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_non_admin_cannot_list_roles(client):
    # First register admin
    await register_admin(client)
    # Register non-admin
    reg = await client.post("/api/v1/auth/register", json={
        "email": "viewer@test.com",
        "password": "viewerpass",
    })
    viewer_token = reg.json()["access_token"]
    resp = await client.get("/api/v1/roles", headers={"Authorization": f"Bearer {viewer_token}"})
    # editor doesn't have role.read permission
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_roles_endpoints.py -v`
Expected: FAIL — `app.api.v1.roles` doesn't exist.

- [ ] **Step 3: Create roles.py**

Create `backend/app/api/v1/roles.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.rbac import require_permission
from app.db import models
from app.db.session import get_db
from app.schemas import RoleAssign, RoleCreate, PermissionAssign

router = APIRouter()


def _role_to_dict(role: models.Role) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "permissions": [
            {"id": str(p.id), "resource": p.resource, "action": p.action}
            for p in role.permissions
        ],
    }


def _user_to_dict(user: models.User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "roles": [
            {"id": str(r.id), "name": r.name, "description": r.description}
            for r in user.roles
        ],
    }


@router.get("/")
async def list_roles(
    current_user=Depends(require_permission("role", "read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Role).options(selectinload(models.Role.permissions))
    )
    return [_role_to_dict(role) for role in result.scalars().all()]


@router.post("/")
async def create_role(
    payload: RoleCreate,
    current_user=Depends(require_permission("role", "create")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(models.Role).where(models.Role.name == payload.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role already exists")
    role = models.Role(name=payload.name, description=payload.description)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return _role_to_dict(role)


@router.post("/assign")
async def assign_role(
    payload: RoleAssign,
    current_user=Depends(require_permission("role", "update")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(models.User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_result = await db.execute(
        select(models.Role).where(models.Role.name == payload.role_name)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role not in user.roles:
        user.roles.append(role)
        await db.commit()
    return {"message": f"Role '{payload.role_name}' assigned to user {payload.user_id}"}


@router.delete("/revoke")
async def revoke_role(
    payload: RoleAssign,
    current_user=Depends(require_permission("role", "update")),
    db: AsyncSession = Depends(get_db),
):
    user_result = await db.execute(
        select(models.User)
        .options(selectinload(models.User.roles))
        .where(models.User.id == payload.user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_result = await db.execute(
        select(models.Role).where(models.Role.name == payload.role_name)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role in user.roles:
        user.roles.remove(role)
        await db.commit()
    return {"message": f"Role '{payload.role_name}' revoked from user {payload.user_id}"}


@router.post("/permissions")
async def add_permission_to_role(
    payload: PermissionAssign,
    current_user=Depends(require_permission("role", "update")),
    db: AsyncSession = Depends(get_db),
):
    role_result = await db.execute(
        select(models.Role)
        .options(selectinload(models.Role.permissions))
        .where(models.Role.name == payload.role_name)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    perm_result = await db.execute(
        select(models.Permission).where(
            models.Permission.resource == payload.resource,
            models.Permission.action == payload.action,
        )
    )
    perm = perm_result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    if perm not in role.permissions:
        role.permissions.append(perm)
        await db.commit()
    return {"message": f"Permission {payload.resource}.{payload.action} added to role '{payload.role_name}'"}


@router.delete("/permissions")
async def remove_permission_from_role(
    payload: PermissionAssign,
    current_user=Depends(require_permission("role", "update")),
    db: AsyncSession = Depends(get_db),
):
    role_result = await db.execute(
        select(models.Role)
        .options(selectinload(models.Role.permissions))
        .where(models.Role.name == payload.role_name)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    perm_result = await db.execute(
        select(models.Permission).where(
            models.Permission.resource == payload.resource,
            models.Permission.action == payload.action,
        )
    )
    perm = perm_result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    if perm in role.permissions:
        role.permissions.remove(perm)
        await db.commit()
    return {"message": f"Permission {payload.resource}.{payload.action} removed from role '{payload.role_name}'"}


@router.get("/users")
async def list_users(
    current_user=Depends(require_permission("user", "read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.User).options(selectinload(models.User.roles))
    )
    return [_user_to_dict(u) for u in result.scalars().all()]
```

- [ ] **Step 4: Update __init__.py to export roles_router**

In `backend/app/api/v1/__init__.py`:

```python
from .projects import router as projects_router
from .features import router as features_router
from .versions import router as versions_router
from .search import router as search_router
from .auth import router as auth_router
from .roles import router as roles_router

__all__ = ["projects_router", "features_router", "versions_router", "search_router", "auth_router", "roles_router"]
```

- [ ] **Step 5: Register roles router in main.py**

In `backend/app/main.py`, add:

```python
from app.api.v1 import projects_router, features_router, versions_router, search_router, auth_router, roles_router
```

And:

```python
app.include_router(roles_router, prefix="/api/v1/roles", tags=["roles"])
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_roles_endpoints.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/roles.py backend/app/api/v1/__init__.py backend/app/main.py backend/tests/test_roles_endpoints.py
git commit -m "feat: add role management endpoints (list, create, assign, revoke, permissions)"
```

---

### Task 9: Create image upload endpoint

**Files:**
- Create: `backend/app/api/v1/uploads.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_upload.py`:

```python
import io
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.session import get_db
from app.main import app


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def get_token(client) -> str:
    resp = await client.post("/api/v1/auth/register", json={
        "email": "uploader@test.com",
        "password": "password123",
    })
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_upload_image(client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    token = await get_token(client)

    # Create a small PNG-like file
    image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    resp = await client.post(
        "/api/v1/uploads/image",
        files={"file": ("test.png", io.BytesIO(image_data), "image/png")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    assert data["url"].startswith("/api/v1/uploads/images/")


@pytest.mark.asyncio
async def test_upload_rejects_non_image(client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    token = await get_token(client)

    resp = await client.post(
        "/api/v1/uploads/image",
        files={"file": ("doc.pdf", io.BytesIO(b"fake pdf"), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_without_auth(client):
    image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    resp = await client.post(
        "/api/v1/uploads/image",
        files={"file": ("test.png", io.BytesIO(image_data), "image/png")},
    )
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_upload.py -v`
Expected: FAIL — `app.api.v1.uploads` doesn't exist.

- [ ] **Step 3: Create uploads.py**

Create `backend/app/api/v1/uploads.py`:

```python
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import get_current_user
from app.db import models

router = APIRouter()

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads/images")


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    # Validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # Validate extension
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File extension '{ext}' is not allowed. Allowed: {ALLOWED_EXTENSIONS}")

    # Read file and check size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 5 MB limit")

    # Build path
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    timestamp = int(datetime.utcnow().timestamp())
    random_suffix = uuid.uuid4().hex[:6]
    filename = f"{timestamp}-{random_suffix}.{ext}"
    file_path = os.path.join(user_dir, filename)

    # Write file
    with open(file_path, "wb") as f:
        f.write(contents)

    # Return URL path
    url = f"/api/v1/uploads/images/{current_user.id}/{filename}"
    return {"url": url}
```

- [ ] **Step 4: Update __init__.py to export uploads_router**

In `backend/app/api/v1/__init__.py`:

```python
from .projects import router as projects_router
from .features import router as features_router
from .versions import router as versions_router
from .search import router as search_router
from .auth import router as auth_router
from .roles import router as roles_router
from .uploads import router as uploads_router

__all__ = ["projects_router", "features_router", "versions_router", "search_router", "auth_router", "roles_router", "uploads_router"]
```

- [ ] **Step 5: Update main.py — register uploads router + mount static files**

In `backend/app/main.py`, add imports and configuration:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1 import projects_router, features_router, versions_router, search_router, auth_router, roles_router, uploads_router

app = FastAPI(title="Feature Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(roles_router, prefix="/api/v1/roles", tags=["roles"])
app.include_router(uploads_router, prefix="/api/v1/uploads", tags=["uploads"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(features_router, prefix="/api/v1/features", tags=["features"])
app.include_router(versions_router, prefix="/api/v1/features/{feature_id}/versions", tags=["versions"])
app.include_router(search_router, prefix="/api/v1/search", tags=["search"])

# Mount uploaded images as static files
upload_dir = os.environ.get("UPLOAD_DIR", "./uploads/images")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/api/v1/uploads/images", StaticFiles(directory=upload_dir), name="uploaded-images")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_upload.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/uploads.py backend/app/api/v1/__init__.py backend/app/main.py backend/tests/test_upload.py
git commit -m "feat: add image upload endpoint with file validation and static serving"
```

---

### Task 10: Create Alembic migration 0003 — RBAC tables + User update

**Files:**
- Create: `backend/alembic/versions/0003_rbac_auth.py`

This migration adds the RBAC tables, adds `hashed_password` to users, removes the old `role` string column, and seeds default roles/permissions.

- [ ] **Step 1: Create migration file**

Create `backend/alembic/versions/0003_rbac_auth.py`:

```python
"""add RBAC tables and update users for JWT auth

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-26
"""

import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# Default permissions
DEFAULT_PERMISSIONS = [
    ("project", "create"), ("project", "read"), ("project", "update"), ("project", "delete"),
    ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
    ("version", "create"), ("version", "read"), ("version", "delete"),
    ("upload", "create"),
    ("user", "read"), ("user", "update"), ("user", "delete"),
    ("role", "create"), ("role", "read"), ("role", "update"), ("role", "delete"),
]

DEFAULT_ROLES = {
    "admin": {
        "description": "Full access to all resources",
        "permissions": None,  # all
    },
    "editor": {
        "description": "Can create and edit projects, features, versions, and upload images",
        "permissions": [
            ("project", "create"), ("project", "read"), ("project", "update"),
            ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
            ("version", "create"), ("version", "read"), ("version", "delete"),
            ("upload", "create"),
        ],
    },
    "viewer": {
        "description": "Read-only access to projects, features, and versions",
        "permissions": [
            ("project", "read"), ("feature", "read"), ("version", "read"),
        ],
    },
}


def upgrade():
    # 1. Create roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
    )

    # 2. Create permissions table
    op.create_table(
        "permissions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource", sa.String(50), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
        sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),
    )

    # 3. Create user_roles join table
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.String(36), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
    )

    # 4. Create role_permissions join table
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.String(36), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.String(36), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # 5. Add hashed_password to users table (nullable initially for existing rows)
    op.add_column("users", sa.Column("hashed_password", sa.String, nullable=True, server_default=""))

    # 6. Remove the old 'role' string column from users
    # Use batch mode for SQLite compatibility
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("role")

    # 7. Seed default permissions
    permissions_table = sa.table(
        "permissions",
        sa.column("id", sa.String),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    perm_ids = {}
    now = datetime.utcnow()
    for resource, action in DEFAULT_PERMISSIONS:
        pid = str(uuid.uuid4())
        perm_ids[(resource, action)] = pid
        op.execute(
            permissions_table.insert().values(
                id=pid, resource=resource, action=action, created_at=now
            )
        )

    # 8. Seed default roles
    roles_table = sa.table(
        "roles",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", sa.String),
        sa.column("permission_id", sa.String),
    )
    for role_name, role_data in DEFAULT_ROLES.items():
        rid = str(uuid.uuid4())
        op.execute(
            roles_table.insert().values(
                id=rid, name=role_name, description=role_data["description"], created_at=now
            )
        )
        # Assign permissions
        if role_data["permissions"] is None:
            # Admin: all permissions
            for perm_key, perm_id in perm_ids.items():
                op.execute(
                    role_permissions_table.insert().values(role_id=rid, permission_id=perm_id)
                )
        else:
            for perm_key in role_data["permissions"]:
                if perm_key in perm_ids:
                    op.execute(
                        role_permissions_table.insert().values(
                            role_id=rid, permission_id=perm_ids[perm_key]
                        )
                    )


def downgrade():
    # Add back old role column
    op.add_column("users", sa.Column("role", sa.String, nullable=False, server_default="viewer"))

    # Remove hashed_password
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("hashed_password")

    # Drop tables in reverse order
    op.drop_table("role_permissions")
    op.drop_table("user_roles")
    op.drop_table("permissions")
    op.drop_table("roles")
```

- [ ] **Step 2: Run migration (if database is available)**

Run: `cd backend && alembic upgrade head`
Expected: Migration applies successfully. Tables `roles`, `permissions`, `user_roles`, `role_permissions` are created; `users.hashed_password` is added; `users.role` is removed; default roles and permissions are seeded.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/0003_rbac_auth.py
git commit -m "feat: add alembic migration 0003 for RBAC tables, user auth columns, and seed data"
```

---

### Task 11: Protect existing backend routes with RBAC

**Files:**
- Modify: `backend/app/api/v1/projects.py`
- Modify: `backend/app/api/v1/features.py`
- Modify: `backend/app/api/v1/versions.py`

Add `require_permission` dependencies to all existing endpoints. Each endpoint checks for the specific permission needed (e.g., `project.read`, `feature.create`).

- [ ] **Step 1: Add auth to projects.py**

In `backend/app/api/v1/projects.py`, add imports at the top:

```python
from app.core.rbac import require_permission
from app.db.models import User
```

Then add the `Depends(require_permission(...))` to each route handler. For example:

```python
@router.get("/")
async def list_projects(
    current_user: User = Depends(require_permission("project", "read")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.post("/")
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_permission("project", "create")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.post("/sync")
async def sync_project(
    payload: ProjectSyncRequest,
    current_user: User = Depends(require_permission("project", "update")),
    db: AsyncSession = Depends(get_db),
):
    return await sync_project_from_snapshot(db, payload)
```

```python
@router.get("/{project_id}")
async def get_project(
    project_id: UUID,
    current_user: User = Depends(require_permission("project", "read")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.patch("/{project_id}")
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    current_user: User = Depends(require_permission("project", "update")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(require_permission("project", "delete")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.get("/{project_id}/features")
async def list_project_features(
    project_id: UUID,
    hierarchy: bool = False,
    current_user: User = Depends(require_permission("feature", "read")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.get("/{project_id}/review-tasks")
async def list_project_review_tasks(
    project_id: UUID,
    status: str | None = "open",
    current_user: User = Depends(require_permission("feature", "read")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

- [ ] **Step 2: Add auth to features.py**

In `backend/app/api/v1/features.py`, add imports:

```python
from app.core.rbac import require_permission
from app.db.models import User
```

Add `current_user` parameter with `require_permission` to each endpoint:

- `list_features` — `Depends(require_permission("feature", "read"))`
- `create_feature` — `Depends(require_permission("feature", "create"))`
- `get_feature` — `Depends(require_permission("feature", "read"))`
- `update_feature` — `Depends(require_permission("feature", "update"))`
- `delete_feature` — `Depends(require_permission("feature", "delete"))`
- `list_feature_evidence` — `Depends(require_permission("feature", "read"))`
- `list_feature_relations` — `Depends(require_permission("feature", "read"))`
- `create_feature_relation` — `Depends(require_permission("feature", "update"))`
- `delete_feature_relation` — `Depends(require_permission("feature", "update"))`
- `list_feature_history` — `Depends(require_permission("feature", "read"))`
- `approve_feature` — `Depends(require_permission("feature", "update"))`
- `reject_feature` — `Depends(require_permission("feature", "update"))`
- `reparent_feature` — `Depends(require_permission("feature", "update"))`
- `merge_feature` — `Depends(require_permission("feature", "update"))`
- `split_feature` — `Depends(require_permission("feature", "create"))`

Each endpoint gets a `current_user: User = Depends(require_permission("feature", "..."))` parameter. The existing function body stays exactly the same.

- [ ] **Step 3: Add auth to versions.py**

In `backend/app/api/v1/versions.py`, add imports:

```python
from app.core.rbac import require_permission
from app.db.models import User
```

Add to both endpoints:

```python
@router.post("/")
async def create_version(
    feature_id: UUID,
    payload: FeatureVersionCreate,
    current_user: User = Depends(require_permission("version", "create")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

```python
@router.get("/")
async def list_versions(
    feature_id: UUID,
    current_user: User = Depends(require_permission("version", "read")),
    db: AsyncSession = Depends(get_db),
):
    # ... existing implementation unchanged
```

- [ ] **Step 4: Run all existing tests to verify nothing breaks**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass. Tests that don't provide auth tokens will need the db to be set up with users and tokens, or the tests updated to include auth headers.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/projects.py backend/app/api/v1/features.py backend/app/api/v1/versions.py
git commit -m "feat: protect all existing routes with RBAC permission checks"
```

---

### Task 12: Frontend — Delete Supabase and Lovable files

**Files:**
- Delete: `frontend/src/integrations/supabase/client.ts`
- Delete: `frontend/src/integrations/supabase/client.server.ts`
- Delete: `frontend/src/integrations/supabase/auth-middleware.ts`
- Delete: `frontend/src/integrations/supabase/types.ts`
- Delete: `frontend/src/integrations/lovable/index.ts`
- Delete: `frontend/src/lib/api_integration_note.txt`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/integrations/supabase/client.ts
rm frontend/src/integrations/supabase/client.server.ts
rm frontend/src/integrations/supabase/auth-middleware.ts
rm frontend/src/integrations/supabase/types.ts
rm frontend/src/integrations/lovable/index.ts
rm frontend/src/lib/api_integration_note.txt
```

- [ ] **Step 2: Remove empty directories if they exist**

```bash
rmdir frontend/src/integrations/supabase 2>/dev/null || true
rmdir frontend/src/integrations/lovable 2>/dev/null || true
rmdir frontend/src/integrations 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/integrations/ frontend/src/lib/api_integration_note.txt
git commit -m "chore: delete Supabase and Lovable integration files"
```

---

### Task 13: Frontend — Rewrite api.ts (remove Supabase, use localStorage)

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Rewrite api.ts**

Replace the entire contents of `frontend/src/lib/api.ts` with:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(opts.headers || {});

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem("access_token");
      headers.set("Authorization", `Bearer ${newToken}`);
      const retry = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API error ${retry.status}: ${text}`);
      }
      return retry.json();
    }
    // Refresh failed — clear auth and redirect
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/auth";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export { API_BASE, apiFetch };
```

- [ ] **Step 2: Verify no Supabase imports remain**

Run: `grep -r "supabase" frontend/src/lib/api.ts`
Expected: No output (no matches).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: rewrite api.ts to use localStorage JWT tokens instead of Supabase"
```

---

### Task 14: Frontend — Rewrite auth.tsx (AuthProvider with backend JWT)

**Files:**
- Modify: `frontend/src/lib/auth.tsx`

- [ ] **Step 1: Rewrite auth.tsx**

Replace the entire contents of `frontend/src/lib/auth.tsx` with:

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_BASE } from "./api";

interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  signOut: () => void;
  hasPermission: (resource: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  roles: [],
  isAdmin: false,
  signOut: () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          // Token invalid — clear
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          return;
        }
        const data = await res.json();
        const roles = (data.roles || []).map((r: { name: string }) => r.name);
        const permissions: string[] = [];
        for (const role of data.roles || []) {
          for (const p of role.permissions || []) {
            const key = `${p.resource}.${p.action}`;
            if (!permissions.includes(key)) permissions.push(key);
          }
        }
        setUser({
          id: data.id,
          email: data.email,
          display_name: data.display_name,
          status: data.status,
          roles,
          permissions,
        });
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    window.location.href = "/auth";
  }, []);

  const hasPermission = useCallback(
    (resource: string, action: string) => {
      if (!user) return false;
      return user.permissions.includes(`${resource}.${action}`);
    },
    [user],
  );

  const roles = user?.roles ?? [];

  const value: AuthContextValue = {
    user,
    loading,
    roles,
    isAdmin: roles.includes("admin"),
    signOut,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 2: Verify no Supabase imports remain**

Run: `grep -r "supabase" frontend/src/lib/auth.tsx`
Expected: No output (no matches).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/auth.tsx
git commit -m "feat: rewrite AuthProvider to use backend JWT auth instead of Supabase"
```

---

### Task 15: Frontend — Rewrite auth route and update route guards

**Files:**
- Modify: `frontend/src/routes/auth.tsx`
- Modify: `frontend/src/routes/index.tsx`
- Modify: `frontend/src/routes/projects.$projectId.tsx`
- Modify: `frontend/src/routes/projects.$projectId.features.$featureId.tsx`

- [ ] **Step 1: Rewrite auth.tsx route**

Replace the entire contents of `frontend/src/routes/auth.tsx` with:

```tsx
import { useState } from "react";
import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { GitBranch, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Featurebase" },
      { name: "description", content: "Sign in or create an account to manage your feature documentation." },
    ],
  }),
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (token) {
      throw redirect({ to: "/" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const endpoint = mode === "signup" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center bg-[image:var(--gradient-subtle)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elevated)]">
            <GitBranch className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to access your projects." : "Start documenting your features."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-md border border-status-done/30 bg-status-done/10 px-3 py-2 text-xs text-status-done">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update index.tsx route guard**

In `frontend/src/routes/index.tsx`:

Remove the import:
```typescript
import { supabase } from "@/integrations/supabase/client";
```

Replace the `beforeLoad`:
```typescript
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      throw redirect({ to: "/auth" });
    }
  },
```

- [ ] **Step 3: Update projects.$projectId.tsx route guard**

In `frontend/src/routes/projects.$projectId.tsx`:

Remove the import:
```typescript
import { supabase } from "@/integrations/supabase/client";
```

Replace the `beforeLoad`:
```typescript
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw redirect({ to: "/auth" });
  },
```

- [ ] **Step 4: Update projects.$projectId.features.$featureId.tsx route guard**

In `frontend/src/routes/projects.$projectId.features.$featureId.tsx`:

Remove the import:
```typescript
import { supabase } from "@/integrations/supabase/client";
```

Replace the `beforeLoad`:
```typescript
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw redirect({ to: "/auth" });
  },
```

- [ ] **Step 5: Verify no Supabase imports remain in route files**

Run: `grep -r "supabase" frontend/src/routes/`
Expected: No output (no matches).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/auth.tsx frontend/src/routes/index.tsx frontend/src/routes/projects.\$projectId.tsx frontend/src/routes/projects.\$projectId.features.\$featureId.tsx
git commit -m "feat: rewrite auth route and update all route guards to use localStorage JWT"
```

---

### Task 16: Frontend — Update MarkdownEditor and remaining files

**Files:**
- Modify: `frontend/src/components/MarkdownEditor.tsx`
- Modify: `frontend/src/routes/__root.tsx`
- Modify: `frontend/src/lib/store.ts`

- [ ] **Step 1: Update MarkdownEditor.tsx — replace Supabase upload with backend API**

In `frontend/src/components/MarkdownEditor.tsx`:

Remove the import:
```typescript
import { supabase } from "@/integrations/supabase/client";
```

Add the import:
```typescript
import { apiFetch, API_BASE } from "@/lib/api";
```

Replace the `uploadImage` callback (lines 96–135). The new implementation:

```typescript
  const uploadImage = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("Sign in to upload images");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5 MB");
        return;
      }
      setUploading(true);
      const placeholderText = `![Uploading ${file.name}…]()`;
      insertAtCursor(`\n${placeholderText}\n`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const result = await apiFetch("/api/v1/uploads/image", {
          method: "POST",
          body: formData,
        });
        const imageUrl = `${API_BASE}${result.url}`;
        const finalMd = `![${file.name.replace(/\.[^.]+$/, "")}](${imageUrl})`;
        onChange(
          (taRef.current?.value ?? value).replace(placeholderText, finalMd)
        );
      } catch (e) {
        console.error(e);
        toast.error("Image upload failed");
        onChange((taRef.current?.value ?? value).replace(placeholderText, ""));
      } finally {
        setUploading(false);
      }
    },
    [user, value, onChange],
  );
```

- [ ] **Step 2: Update __root.tsx — remove Lovable image URLs**

In `frontend/src/routes/__root.tsx`, replace the og:image and twitter:image meta tags (lines 24–25):

Replace:
```typescript
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
```

With:
```typescript
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:image", content: "/og-image.png" },
```

- [ ] **Step 3: Update store.ts — remove Supabase comment**

In `frontend/src/lib/store.ts`, line 17, remove:
```typescript
// Projects are stored in Supabase (see lib/projects.ts and useProjects hook).
```

Replace with:
```typescript
// In-memory feature/relation/history store. Projects fetched via backend API.
```

- [ ] **Step 4: Verify no Supabase references remain**

Run: `grep -rn "supabase" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".gen."`
Expected: No output (no matches).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MarkdownEditor.tsx frontend/src/routes/__root.tsx frontend/src/lib/store.ts
git commit -m "feat: update MarkdownEditor to use backend uploads, remove Lovable URLs and Supabase references"
```

---

### Task 17: Frontend — Replace Vite config, update package.json, clean up .env

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/.env`

- [ ] **Step 1: Replace vite.config.ts**

Replace the entire contents of `frontend/vite.config.ts` with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
```

Note: `tanstackStart()` must come first — it configures SSR entry points and route code-splitting. The Lovable config bundled this along with Cloudflare and other dev-only plugins; we only need the core set now.

- [ ] **Step 2: Remove Supabase and Lovable packages from package.json**

Run:
```bash
cd frontend && npm uninstall @supabase/supabase-js @lovable.dev/cloud-auth-js @lovable.dev/vite-tanstack-config
```

If using bun:
```bash
cd frontend && bun remove @supabase/supabase-js @lovable.dev/cloud-auth-js @lovable.dev/vite-tanstack-config
```

- [ ] **Step 3: Update .env — remove Supabase variables**

Replace `frontend/.env` with:

```
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 4: Install dependencies and verify build**

Run:
```bash
cd frontend && npm install && npm run build
```

Expected: Build completes without errors.

- [ ] **Step 5: Verify no Supabase/Lovable references remain in entire frontend**

Run: `grep -rn "supabase\|lovable" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".gen."`
Expected: No output.

Run: `grep -n "supabase\|lovable" frontend/package.json`
Expected: No output.

- [ ] **Step 6: Commit**

```bash
git add frontend/vite.config.ts frontend/package.json frontend/.env frontend/bun.lockb frontend/package-lock.json
git commit -m "feat: replace Lovable Vite config with standard plugins, remove Supabase/Lovable packages"
```

---

### Task 18: Final verification — run all backend tests

**Files:** No file changes — validation only.

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run frontend dev server**

Run: `cd frontend && npm run dev`
Expected: Dev server starts. Visiting `http://localhost:3000/auth` shows the login/signup form (no Google OAuth button, no Supabase references).

- [ ] **Step 4: Verify backend starts**

Run: `cd backend && uvicorn app.main:app --reload`
Expected: Backend starts. `GET /api/v1/health` returns `{"status": "ok"}`. `POST /api/v1/auth/register` works with email/password. `GET /api/v1/auth/me` with Bearer token returns user with roles.

- [ ] **Step 5: Final commit (if any loose changes)**

```bash
git status
# If clean, skip. Otherwise:
git add -A
git commit -m "chore: final cleanup after Supabase/Lovable removal"
```
