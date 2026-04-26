import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/featuredb"
    secret_key: str = secrets.token_urlsafe(32)
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    gitnexus_default_repo_path: str | None = None
    gitnexus_default_sqlite_path: str | None = None
    gitnexus_convert_command: str = "gitnexus convert-lbug-sqlite"


settings = Settings()
