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
