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
