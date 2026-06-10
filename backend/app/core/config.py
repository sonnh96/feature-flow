import logging
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_EPHEMERAL_SECRET = secrets.token_urlsafe(32)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/featuredb"
    secret_key: str = _EPHEMERAL_SECRET
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    gitnexus_default_repo_path: str | None = None
    gitnexus_default_sqlite_path: str | None = None
    gitnexus_convert_command: str = "gitnexus convert-lbug-sqlite"


settings = Settings()

if settings.secret_key == _EPHEMERAL_SECRET:
    logger.warning(
        "SECRET_KEY is not set via environment — using a random ephemeral key. "
        "All tokens will be invalidated on restart."
    )
