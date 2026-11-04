
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel

from app.repositories.store import DEFAULT_DB_PATH


class RepositoryIndexMetadata(BaseModel):
    repository_id: UUID
    commit_sha: str
    indexed_at: datetime


class RepositoryIndexStore:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)

    def _connect(self):
        self.db_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        connection = sqlite3.connect(
            self.db_path,
            timeout=10,
        )
        connection.row_factory = sqlite3.Row

        return connection

    def initialize(self) -> None:
        with closing(self._connect()) as conn:
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS repository_indexes (
                        repository_id TEXT PRIMARY KEY,
                        commit_sha TEXT NOT NULL,
                        indexed_at TEXT NOT NULL
                    )
                    """
                )

    def save(
        self,
        repository_id: UUID,
        commit_sha: str,
    ) -> RepositoryIndexMetadata:
        self.initialize()

        metadata = RepositoryIndexMetadata(
            repository_id=repository_id,
            commit_sha=commit_sha,
            indexed_at=datetime.now(timezone.utc),
        )

        with closing(self._connect()) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO repository_indexes (
                        repository_id,
                        commit_sha,
                        indexed_at
                    )
                    VALUES (?, ?, ?)
                    ON CONFLICT(repository_id)
                    DO UPDATE SET
                        commit_sha = excluded.commit_sha,
                        indexed_at = excluded.indexed_at
                    """,
                    (
                        str(metadata.repository_id),
                        metadata.commit_sha,
                        metadata.indexed_at.isoformat(),
                    ),
                )

        return metadata

    def get(
        self,
        repository_id: UUID,
    ) -> RepositoryIndexMetadata | None:
        self.initialize()

        with closing(self._connect()) as conn:
            row = conn.execute(
                """
                SELECT repository_id, commit_sha, indexed_at
                FROM repository_indexes
                WHERE repository_id = ?
                """,
                (str(repository_id),),
            ).fetchone()

        if row is None:
            return None

        return RepositoryIndexMetadata.model_validate(dict(row))
