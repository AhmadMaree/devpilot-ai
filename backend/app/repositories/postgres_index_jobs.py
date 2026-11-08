
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.storage.database import get_database_engine
from app.repositories.index_jobs import (
    DuplicateIndexJobError,
    IndexJobQueueFullError,
    IndexJobStateChangedError,
    IndexingJob,
)


class PostgresIndexJobStore:
    """PostgreSQL implementation of the indexing job store."""

    # Application-wide advisory lock for index job admission.
    _QUEUE_LOCK_ID = 7463219001

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine if engine is not None else get_database_engine()

    def initialize(self) -> None:
        """Alembic owns schema creation."""
        return None

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _parse(row) -> IndexingJob | None:
        if row is None:
            return None
        return IndexingJob.model_validate(dict(row))

    def create_queued(
        self,
        repository_id: UUID,
        capacity: int,
    ) -> IndexingJob:
        if capacity <= 0:
            raise ValueError("capacity must be greater than zero")

        job = IndexingJob(
            job_id=uuid4(),
            repository_id=repository_id,
            status="queued",
            phase="queued",
            processed_chunks=0,
            total_chunks=0,
            created_at=datetime.now(UTC),
        )

        try:
            with self.engine.begin() as connection:
                # Serialize admissions across API instances.
                connection.execute(
                    text("SELECT pg_advisory_xact_lock(:lock_id)"),
                    {"lock_id": self._QUEUE_LOCK_ID},
                )

                existing = connection.execute(
                    text("""
                        SELECT 1
                        FROM repository_index_jobs
                        WHERE repository_id = :repository_id
                          AND status IN ('queued', 'running')
                        LIMIT 1
                    """),
                    {"repository_id": str(repository_id)},
                ).first()

                if existing is not None:
                    raise DuplicateIndexJobError(
                        "Repository already has an active indexing job"
                    )

                active_count = connection.execute(
                    text("""
                        SELECT COUNT(*)
                        FROM repository_index_jobs
                        WHERE status IN ('queued', 'running')
                    """)
                ).scalar_one()

                if active_count >= capacity:
                    raise IndexJobQueueFullError(
                        "Indexing job queue is full"
                    )

                connection.execute(
                    text("""
                        INSERT INTO repository_index_jobs (
                            job_id,
                            repository_id,
                            status,
                            phase,
                            processed_chunks,
                            total_chunks,
                            created_at
                        )
                        VALUES (
                            :job_id,
                            :repository_id,
                            :status,
                            :phase,
                            :processed_chunks,
                            :total_chunks,
                            :created_at
                        )
                    """),
                    {
                        "job_id": str(job.job_id),
                        "repository_id": str(job.repository_id),
                        "status": job.status,
                        "phase": job.phase,
                        "processed_chunks": job.processed_chunks,
                        "total_chunks": job.total_chunks,
                        "created_at": job.created_at.isoformat(),
                    },
                )
        except IntegrityError as exc:
            # The partial unique index is a second line of defense.
            if (
                getattr(exc.orig, "sqlstate", None) == "23505"
                and getattr(
                    getattr(exc.orig, "diag", None),
                    "constraint_name",
                    None,
                ) == "idx_index_jobs_active_repository"
            ):
                raise DuplicateIndexJobError(
                    "Repository already has an active indexing job"
                ) from exc
            raise

        return job

    def get(self, job_id: UUID) -> IndexingJob | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT *
                    FROM repository_index_jobs
                    WHERE job_id = :job_id
                """),
                {"job_id": str(job_id)},
            ).mappings().first()

        return self._parse(row)

    def latest(
        self,
        repository_id: UUID,
    ) -> IndexingJob | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT *
                    FROM repository_index_jobs
                    WHERE repository_id = :repository_id
                    ORDER BY created_at DESC, job_id DESC
                    LIMIT 1
                """),
                {"repository_id": str(repository_id)},
            ).mappings().first()

        return self._parse(row)

    def queued(self) -> list[IndexingJob]:
        with self.engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT *
                    FROM repository_index_jobs
                    WHERE status = 'queued'
                    ORDER BY created_at ASC, job_id ASC
                """)
            ).mappings().all()

        return [IndexingJob.model_validate(dict(row)) for row in rows]

    def recover_running(self) -> int:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET status = 'failed',
                        phase = 'failed',
                        completed_at = :completed_at,
                        error_message =
                            'Indexing was interrupted by a server restart.'
                    WHERE status = 'running'
                """),
                {"completed_at": self._now()},
            )

        return result.rowcount

    def mark_running(self, job_id: UUID) -> bool:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET status = 'running',
                        phase = 'ingestion',
                        started_at = :started_at
                    WHERE job_id = :job_id
                      AND status = 'queued'
                """),
                {
                    "job_id": str(job_id),
                    "started_at": self._now(),
                },
            )

        return result.rowcount == 1

    def update_progress(
        self,
        job_id: UUID,
        phase: str,
        processed_chunks: int,
        total_chunks: int,
    ) -> None:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET phase = :phase,
                        processed_chunks = :processed_chunks,
                        total_chunks = :total_chunks
                    WHERE job_id = :job_id
                      AND status = 'running'
                """),
                {
                    "job_id": str(job_id),
                    "phase": phase,
                    "processed_chunks": processed_chunks,
                    "total_chunks": total_chunks,
                },
            )

            if result.rowcount != 1:
                raise IndexJobStateChangedError(
                    "Indexing job is no longer running"
                )

    def complete(
        self,
        job_id: UUID,
        total_chunks: int,
    ) -> bool:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET status = 'completed',
                        phase = 'completed',
                        processed_chunks = :total_chunks,
                        total_chunks = :total_chunks,
                        completed_at = :completed_at,
                        error_message = NULL
                    WHERE job_id = :job_id
                      AND status = 'running'
                """),
                {
                    "job_id": str(job_id),
                    "total_chunks": total_chunks,
                    "completed_at": self._now(),
                },
            )

        return result.rowcount == 1

    def fail(
        self,
        job_id: UUID,
        error_message: str,
    ) -> bool:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET status = 'failed',
                        phase = 'failed',
                        completed_at = :completed_at,
                        error_message = :error_message
                    WHERE job_id = :job_id
                      AND status IN ('queued', 'running')
                """),
                {
                    "job_id": str(job_id),
                    "completed_at": self._now(),
                    "error_message": error_message,
                },
            )

        return result.rowcount == 1

    def interrupt_running(self) -> int:
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET status = 'failed',
                        phase = 'failed',
                        completed_at = :completed_at,
                        error_message =
                            'Indexing was interrupted during server shutdown.'
                    WHERE status = 'running'
                """),
                {"completed_at": self._now()},
            )

        return result.rowcount
