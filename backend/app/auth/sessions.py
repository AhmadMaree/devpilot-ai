
import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from app.core import get_settings


@dataclass(frozen=True)
class Session:
    csrf_token: str
    expires_at: int


def database_path() -> Path:
    path = get_settings().database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(
        database_path(),
        timeout=10,
    )
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize_auth_tables() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                csrf_token TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_login_attempts (
                bucket TEXT PRIMARY KEY,
                attempts INTEGER NOT NULL,
                window_start INTEGER NOT NULL,
                blocked_until INTEGER NOT NULL
            )
            """
        )


def token_hash(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def create_session() -> tuple[str, Session]:
    token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)

    expires_at = int(time.time()) + (
        get_settings().auth_session_hours * 3600
    )

    with connect() as connection:
        connection.execute(
            "DELETE FROM auth_sessions WHERE expires_at <= ?",
            (int(time.time()),),
        )

        connection.execute(
            """
            INSERT INTO auth_sessions
                (token_hash, csrf_token, expires_at)
            VALUES (?, ?, ?)
            """,
            (token_hash(token), csrf_token, expires_at),
        )

    return token, Session(
        csrf_token=csrf_token,
        expires_at=expires_at,
    )


def get_session(token: str) -> Session | None:
    if not token:
        return None

    with connect() as connection:
        row = connection.execute(
            """
            SELECT csrf_token, expires_at
            FROM auth_sessions
            WHERE token_hash = ?
              AND expires_at > ?
            """,
            (token_hash(token), int(time.time())),
        ).fetchone()

    if row is None:
        return None

    return Session(
        csrf_token=row[0],
        expires_at=row[1],
    )


def revoke_session(token: str) -> None:
    if not token:
        return

    with connect() as connection:
        connection.execute(
            "DELETE FROM auth_sessions WHERE token_hash = ?",
            (token_hash(token),),
        )


# Single-user local login protection:
# 5 failed attempts per 15-minute window, followed
# by a 15-minute block. Shared across processes
# through SQLite.
WINDOW_SECONDS = 15 * 60
BLOCK_SECONDS = 15 * 60
MAX_FAILURES = 5


def login_allowed(bucket: str) -> bool:
    now = int(time.time())

    with connect() as connection:
        row = connection.execute(
            """
            SELECT attempts, window_start, blocked_until
            FROM auth_login_attempts
            WHERE bucket = ?
            """,
            (bucket,),
        ).fetchone()

    if row is None:
        return True

    attempts, window_start, blocked_until = row

    if blocked_until > now:
        return False

    if now - window_start >= WINDOW_SECONDS:
        return True

    return attempts < MAX_FAILURES


def record_login_failure(bucket: str) -> None:
    now = int(time.time())

    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")

        row = connection.execute(
            """
            SELECT attempts, window_start
            FROM auth_login_attempts
            WHERE bucket = ?
            """,
            (bucket,),
        ).fetchone()

        if row is None or now - row[1] >= WINDOW_SECONDS:
            attempts = 1
            window_start = now
        else:
            attempts = row[0] + 1
            window_start = row[1]

        blocked_until = (
            now + BLOCK_SECONDS
            if attempts >= MAX_FAILURES
            else 0
        )

        connection.execute(
            """
            INSERT INTO auth_login_attempts
                (bucket, attempts, window_start, blocked_until)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(bucket) DO UPDATE SET
                attempts = excluded.attempts,
                window_start = excluded.window_start,
                blocked_until = excluded.blocked_until
            """,
            (
                bucket,
                attempts,
                window_start,
                blocked_until,
            ),
        )


def clear_login_failures(bucket: str) -> None:
    with connect() as connection:
        connection.execute(
            "DELETE FROM auth_login_attempts WHERE bucket = ?",
            (bucket,),
        )
