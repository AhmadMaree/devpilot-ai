
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel

from app.repositories.index_jobs import IndexJobStateChangedError
from app.repositories.store import DEFAULT_DB_PATH


class RepositoryIndexMetadata(BaseModel):
    repository_id: UUID
    commit_sha: str
    indexed_at: datetime
    index_version: str | None = None


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
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS repository_indexes (
                    repository_id TEXT PRIMARY KEY,
                    commit_sha TEXT NOT NULL,
                    indexed_at TEXT NOT NULL,
                    index_version TEXT
                )
                """
            )
            columns = {
                row["name"]
                for row in conn.execute(
                    "PRAGMA table_info(repository_indexes)"
                )
            }
            if "index_version" not in columns:
                conn.execute(
                    "ALTER TABLE repository_indexes "
                    "ADD COLUMN index_version TEXT"
                )

    def save(
        self,
        repository_id: UUID,
        commit_sha: str,
        index_version: str | None = None,
    ) -> RepositoryIndexMetadata:
        self.initialize()

        metadata = RepositoryIndexMetadata(
            repository_id=repository_id,
            commit_sha=commit_sha,
            indexed_at=datetime.now(UTC),
            index_version=index_version,
        )

        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                INSERT INTO repository_indexes (
                    repository_id, commit_sha, indexed_at, index_version
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(repository_id)
                DO UPDATE SET
                    commit_sha = excluded.commit_sha,
                    indexed_at = excluded.indexed_at,
                    index_version = excluded.index_version
                """,
                (
                    str(metadata.repository_id),
                    metadata.commit_sha,
                    metadata.indexed_at.isoformat(),
                    metadata.index_version,
                ),
            )

        return metadata

    def activate_for_job(
        self,
        repository_id: UUID,
        commit_sha: str,
        index_version: str,
        job_id: UUID,
        total_chunks: int,
    ) -> RepositoryIndexMetadata:
        self.initialize()
        metadata = RepositoryIndexMetadata(
            repository_id=repository_id,
            commit_sha=commit_sha,
            indexed_at=datetime.now(UTC),
            index_version=index_version,
        )

        with closing(self._connect()) as conn, conn:
            pointer_cursor = conn.execute(
                """
                INSERT INTO repository_indexes (
                    repository_id, commit_sha, indexed_at, index_version
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(repository_id)
                DO UPDATE SET
                    commit_sha = excluded.commit_sha,
                    indexed_at = excluded.indexed_at,
                    index_version = excluded.index_version
                """,
                (
                    str(repository_id),
                    commit_sha,
                    metadata.indexed_at.isoformat(),
                    index_version,
                ),
            )
            if pointer_cursor.rowcount != 1:
                raise sqlite3.IntegrityError(
                    "Active repository index was not updated"
                )
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'completed',
                    phase = 'completed',
                    processed_chunks = ?,
                    total_chunks = ?,
                    completed_at = ?,
                    error_message = NULL
                WHERE job_id = ?
                  AND repository_id = ?
                  AND status = 'running'
                """,
                (
                    total_chunks,
                    total_chunks,
                    metadata.indexed_at.isoformat(),
                    str(job_id),
                    str(repository_id),
                ),
            )
            if cursor.rowcount != 1:
                raise IndexJobStateChangedError(
                    "Indexing job is no longer running"
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
                SELECT repository_id, commit_sha, indexed_at, index_version
                FROM repository_indexes
                WHERE repository_id = ?
                """,
                (str(repository_id),),
            ).fetchone()

        if row is None:
            return None

        return RepositoryIndexMetadata.model_validate(dict(row))
