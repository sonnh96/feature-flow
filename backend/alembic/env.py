import os
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy import engine_from_config
from alembic import context

from app.db.models import Base

config = context.config
# Only call fileConfig if config file defines logging sections
try:
    fileConfig(config.config_file_name)
except Exception:
    pass


def get_url():
    return os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:postgres@db:5432/featuredb')

# set sqlalchemy url dynamically
config.set_main_option('sqlalchemy.url', get_url())

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    from sqlalchemy import engine_from_config
    from sqlalchemy import pool
    from sqlalchemy.ext.asyncio import create_async_engine

    url = config.get_main_option('sqlalchemy.url')
    if url.startswith('postgresql+asyncpg'):
        # async engine flow
        async_engine = create_async_engine(url, poolclass=pool.NullPool)

        async def run_async_migrations():
            async with async_engine.connect() as connection:
                await connection.run_sync(run_migrations_with_connection)
            await async_engine.dispose()

        import asyncio
        asyncio.run(run_async_migrations())
    else:
        # sync engine fallback
        connectable = engine_from_config(
            config.get_section(config.config_ini_section),
            prefix='sqlalchemy.',
            poolclass=pool.NullPool,
        )

        with connectable.connect() as connection:
            run_migrations_with_connection(connection)


def run_migrations_with_connection(connection):
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
