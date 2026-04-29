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
