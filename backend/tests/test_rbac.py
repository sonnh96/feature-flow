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
