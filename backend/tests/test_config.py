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
