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
