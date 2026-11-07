import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel

from app.core import get_settings

IndexJobStatus = Literal["queued", "running", "completed", "failed"]


class IndexingJob(BaseModel):
    job_id: UUID
    repository_id: UUID
    status: IndexJobStatus
    phase: str
    processed_chunks: int
    total_chunks: int
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None


class DuplicateIndexJobError(Exception):
    pass


class IndexJobQueueFullError(Exception):
    pass


class IndexJobStateChangedError(Exception):
    pass


class IndexingCancelledError(Exception):
    pass


class IndexJobStore:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(
            db_path if db_path is not None else get_settings().database_path
        )

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def initialize(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS repository_index_jobs (
                    job_id TEXT PRIMARY KEY,
                    repository_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    processed_chunks INTEGER NOT NULL DEFAULT 0,
                    total_chunks INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    error_message TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_index_jobs_latest
                ON repository_index_jobs(repository_id, created_at DESC)
                """
            )
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_index_jobs_active_repository
                ON repository_index_jobs(repository_id)
                WHERE status IN ('queued', 'running')
                """
            )

    def create_queued(
        self,
        repository_id: UUID,
        capacity: int,
    ) -> IndexingJob:
        self.initialize()
        job_id = uuid4()
        created_at = datetime.now(UTC)

        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            active = conn.execute(
                """
                SELECT 1 FROM repository_index_jobs
                WHERE repository_id = ? AND status IN ('queued', 'running')
                """,
                (str(repository_id),),
            ).fetchone()
            if active is not None:
                raise DuplicateIndexJobError

            active_count = conn.execute(
                """
                SELECT COUNT(*) FROM repository_index_jobs
                WHERE status IN ('queued', 'running')
                """
            ).fetchone()[0]
            if active_count >= capacity:
                raise IndexJobQueueFullError

            job = IndexingJob(
                job_id=job_id,
                repository_id=repository_id,
                status="queued",
                phase="queued",
                processed_chunks=0,
                total_chunks=0,
                created_at=created_at,
            )
            cursor = conn.execute(
                """
                INSERT INTO repository_index_jobs (
                    job_id, repository_id, status, phase,
                    processed_chunks, total_chunks, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(job.job_id),
                    str(job.repository_id),
                    job.status,
                    job.phase,
                    job.processed_chunks,
                    job.total_chunks,
                    job.created_at.isoformat(),
                ),
            )
            if cursor.rowcount != 1:
                raise sqlite3.IntegrityError("Indexing job was not queued")
            conn.commit()
        return job

    def get(self, job_id: UUID) -> IndexingJob | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM repository_index_jobs WHERE job_id = ?",
                (str(job_id),),
            ).fetchone()
        return IndexingJob.model_validate(dict(row)) if row else None

    def latest(self, repository_id: UUID) -> IndexingJob | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                """
                SELECT * FROM repository_index_jobs
                WHERE repository_id = ?
                ORDER BY created_at DESC, rowid DESC
                LIMIT 1
                """,
                (str(repository_id),),
            ).fetchone()
        return IndexingJob.model_validate(dict(row)) if row else None

    def queued(self) -> list[IndexingJob]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT * FROM repository_index_jobs
                WHERE status = 'queued'
                ORDER BY created_at, rowid
                """
            ).fetchall()
        return [IndexingJob.model_validate(dict(row)) for row in rows]

    def recover_running(self) -> int:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'failed',
                    phase = 'failed',
                    completed_at = ?,
                    error_message = 'Indexing was interrupted by a server restart.'
                WHERE status = 'running'
                """,
                (datetime.now(UTC).isoformat(),),
            )
            return cursor.rowcount

    def mark_running(self, job_id: UUID) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'running',
                    phase = 'ingestion',
                    started_at = ?
                WHERE job_id = ? AND status = 'queued'
                """,
                (datetime.now(UTC).isoformat(), str(job_id)),
            )
            return cursor.rowcount == 1

    def update_progress(
        self,
        job_id: UUID,
        phase: str,
        processed_chunks: int,
        total_chunks: int,
    ) -> None:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET phase = ?, processed_chunks = ?, total_chunks = ?
                WHERE job_id = ? AND status = 'running'
                """,
                (phase, processed_chunks, total_chunks, str(job_id)),
            )
            if cursor.rowcount != 1:
                raise IndexJobStateChangedError("Indexing job is no longer running")

    def complete(self, job_id: UUID, total_chunks: int) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'completed',
                    phase = 'completed',
                    processed_chunks = ?,
                    total_chunks = ?,
                    completed_at = ?,
                    error_message = NULL
                WHERE job_id = ? AND status = 'running'
                """,
                (
                    total_chunks,
                    total_chunks,
                    datetime.now(UTC).isoformat(),
                    str(job_id),
                ),
            )
            return cursor.rowcount == 1

    def fail(self, job_id: UUID, error_message: str) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'failed',
                    phase = 'failed',
                    completed_at = ?,
                    error_message = ?
                WHERE job_id = ? AND status IN ('queued', 'running')
                """,
                (datetime.now(UTC).isoformat(), error_message, str(job_id)),
            )
            return cursor.rowcount == 1

    def interrupt_running(self) -> int:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE repository_index_jobs
                SET status = 'failed',
                    phase = 'failed',
                    completed_at = ?,
                    error_message = 'Indexing was interrupted during server shutdown.'
                WHERE status = 'running'
                """,
                (datetime.now(UTC).isoformat(),),
            )
            return cursor.rowcount
