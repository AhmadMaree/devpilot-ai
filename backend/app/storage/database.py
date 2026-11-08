from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url

from app.core import get_settings



@lru_cache(maxsize=1)
def get_database_engine() -> Engine:
    settings = get_settings()
    database_url = settings.database_url.get_secret_value()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL must be configured for PostgreSQL"
        )

    url = make_url(database_url)

    if url.drivername != "postgresql+psycopg":
        raise ValueError(
            "DATABASE_URL must use postgresql+psycopg"
        )

    if not url.database:
        raise ValueError(
            "DATABASE_URL must specify a database"
        )

    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        pool_timeout=30,
        pool_recycle=1800,
        connect_args={
            "connect_timeout": 10,
            "sslmode": "require",
        },
    )