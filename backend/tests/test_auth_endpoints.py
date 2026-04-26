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