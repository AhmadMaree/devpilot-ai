
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core import get_settings

# Alembic configuration
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# We'll define the database tables in migration files.
# Autogenerate is not enabled yet.
target_metadata = None


def get_database_url() -> str:
    """Read the PostgreSQL URL from the application's settings."""
    settings = get_settings()
    database_url = settings.database_url.get_secret_value()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is missing. Add it to backend/.env"
        )

    if not database_url.startswith("postgresql+psycopg://"):
        raise ValueError(
            "DATABASE_URL must use postgresql+psycopg://"
        )

    return database_url


def run_migrations_offline() -> None:
    """Generate migration SQL without connecting to PostgreSQL."""
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against Azure PostgreSQL."""
    engine = create_engine(
        get_database_url(),
        poolclass=pool.NullPool,
        connect_args={
            "sslmode": "require",
            "connect_timeout": 10,
        },
    )

    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
