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
