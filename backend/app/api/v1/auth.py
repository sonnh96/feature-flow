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
