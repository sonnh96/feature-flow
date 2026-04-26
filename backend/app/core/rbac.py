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
