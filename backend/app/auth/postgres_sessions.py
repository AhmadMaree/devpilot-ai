
import hashlib
import secrets
import time
from dataclasses import dataclass

from sqlalchemy import text

from app.core import get_settings
from app.storage.database import get_database_engine


@dataclass(frozen=True)
class Session:
    csrf_token: str
    expires_at: int


WINDOW_SECONDS = 15 * 60
BLOCK_SECONDS = 15 * 60
MAX_FAILURES = 5


def initialize_auth_tables() -> None:
    """Alembic manages authentication tables."""
    return None


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session() -> tuple[str, Session]:
    token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)

    now = int(time.time())
    expires_at = now + (
        get_settings().auth_session_hours * 3600
    )

    engine = get_database_engine()

    with engine.begin() as connection:
        connection.execute(
            text("""
                DELETE FROM auth_sessions
                WHERE expires_at <= :now
            """),
            {"now": now},
        )

        connection.execute(
            text("""
                INSERT INTO auth_sessions (
                    token_hash,
                    csrf_token,
                    expires_at
                )
                VALUES (
                    :token_hash,
                    :csrf_token,
                    :expires_at
                )
            """),
            {
                "token_hash": token_hash(token),
                "csrf_token": csrf_token,
                "expires_at": expires_at,
            },
        )

    return token, Session(
        csrf_token=csrf_token,
        expires_at=expires_at,
    )


def get_session(token: str) -> Session | None:
    if not token:
        return None

    engine = get_database_engine()

    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT csrf_token, expires_at
                FROM auth_sessions
                WHERE token_hash = :token_hash
                  AND expires_at > :now
            """),
            {
                "token_hash": token_hash(token),
                "now": int(time.time()),
            },
        ).mappings().first()

    if row is None:
        return None

    return Session(
        csrf_token=row["csrf_token"],
        expires_at=row["expires_at"],
    )


def revoke_session(token: str) -> None:
    if not token:
        return

    engine = get_database_engine()

    with engine.begin() as connection:
        connection.execute(
            text("""
                DELETE FROM auth_sessions
                WHERE token_hash = :token_hash
            """),
            {"token_hash": token_hash(token)},
        )


def login_allowed(bucket: str) -> bool:
    now = int(time.time())
    engine = get_database_engine()

    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT
                    attempts,
                    window_start,
                    blocked_until
                FROM auth_login_attempts
                WHERE bucket = :bucket
            """),
            {"bucket": bucket},
        ).mappings().first()

    if row is None:
        return True

    if row["blocked_until"] > now:
        return False

    if now - row["window_start"] >= WINDOW_SECONDS:
        return True

    return row["attempts"] < MAX_FAILURES


def record_login_failure(bucket: str) -> None:
    now = int(time.time())
    engine = get_database_engine()

    # The UPSERT performs the counter increment in PostgreSQL,
    # avoiding a read-then-write race between requests.
    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO auth_login_attempts (
                    bucket,
                    attempts,
                    window_start,
                    blocked_until
                )
                VALUES (
                    :bucket,
                    1,
                    :now,
                    0
                )
                ON CONFLICT (bucket)
                DO UPDATE SET
                    attempts = CASE
                        WHEN :now - auth_login_attempts.window_start
                             >= :window_seconds
                        THEN 1
                        ELSE auth_login_attempts.attempts + 1
                    END,
                    window_start = CASE
                        WHEN :now - auth_login_attempts.window_start
                             >= :window_seconds
                        THEN :now
                        ELSE auth_login_attempts.window_start
                    END,
                    blocked_until = CASE
                        WHEN :now - auth_login_attempts.window_start
                             >= :window_seconds
                        THEN 0
                        WHEN auth_login_attempts.attempts + 1
                             >= :max_failures
                        THEN :now + :block_seconds
                        ELSE 0
                    END
            """),
            {
                "bucket": bucket,
                "now": now,
                "window_seconds": WINDOW_SECONDS,
                "block_seconds": BLOCK_SECONDS,
                "max_failures": MAX_FAILURES,
            },
        )

        # New rows start at one failure and are not blocked.


def clear_login_failures(bucket: str) -> None:
    engine = get_database_engine()

    with engine.begin() as connection:
        connection.execute(
            text("""
                DELETE FROM auth_login_attempts
                WHERE bucket = :bucket
            """),
            {"bucket": bucket},
        )
