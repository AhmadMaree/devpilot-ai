from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.repositories.index_jobs import IndexJobStateChangedError
from app.storage.database import get_database_engine


class RepositoryIndexMetadata(BaseModel):
    repository_id: UUID
    commit_sha: str
    indexed_at: datetime
    index_version: str | None = None
    azure_ready: bool = False
    embedding_model: str | None = None


class PostgresRepositoryIndexStore:
    """PostgreSQL-backed repository index metadata."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine if engine is not None else get_database_engine()

    def initialize(self) -> None:
        # Alembic owns database schema creation.
        return None

    @staticmethod
    def _parameters(
        metadata: RepositoryIndexMetadata,
    ) -> dict:
        return {
            "repository_id": str(metadata.repository_id),
            "commit_sha": metadata.commit_sha,
            "indexed_at": metadata.indexed_at.isoformat(),
            "index_version": metadata.index_version,
            "azure_ready": int(metadata.azure_ready),
            "embedding_model": metadata.embedding_model,
        }

    @staticmethod
    def _upsert_statement():
        return text("""
            INSERT INTO repository_indexes (
                repository_id,
                commit_sha,
                indexed_at,
                index_version,
                azure_ready,
                embedding_model
            )
            VALUES (
                :repository_id,
                :commit_sha,
                :indexed_at,
                :index_version,
                :azure_ready,
                :embedding_model
            )
            ON CONFLICT (repository_id)
            DO UPDATE SET
                commit_sha = EXCLUDED.commit_sha,
                indexed_at = EXCLUDED.indexed_at,
                index_version = EXCLUDED.index_version,
                azure_ready = EXCLUDED.azure_ready,
                embedding_model = EXCLUDED.embedding_model
        """)

    def save(
        self,
        repository_id: UUID,
        commit_sha: str,
        index_version: str | None = None,
        azure_ready: bool = False,
        embedding_model: str | None = None,
    ) -> RepositoryIndexMetadata:
        metadata = RepositoryIndexMetadata(
            repository_id=repository_id,
            commit_sha=commit_sha,
            indexed_at=datetime.now(UTC),
            index_version=index_version,
            azure_ready=azure_ready,
            embedding_model=embedding_model,
        )

        with self.engine.begin() as connection:
            connection.execute(
                self._upsert_statement(),
                self._parameters(metadata),
            )

        return metadata

    def activate_for_job(
        self,
        repository_id: UUID,
        commit_sha: str,
        index_version: str,
        job_id: UUID,
        total_chunks: int,
        azure_ready: bool = False,
        embedding_model: str | None = None,
    ) -> RepositoryIndexMetadata:
        if total_chunks < 0:
            raise ValueError("total_chunks cannot be negative")

        metadata = RepositoryIndexMetadata(
            repository_id=repository_id,
            commit_sha=commit_sha,
            indexed_at=datetime.now(UTC),
            index_version=index_version,
            azure_ready=azure_ready,
            embedding_model=embedding_model,
        )

        # Both changes must commit or roll back together.
        with self.engine.begin() as connection:
            # First claim the running job using a conditional update.
            # PostgreSQL locks the matching row until commit.
            result = connection.execute(
                text("""
                    UPDATE repository_index_jobs
                    SET
                        status = 'completed',
                        phase = 'completed',
                        processed_chunks = :total_chunks,
                        total_chunks = :total_chunks,
                        completed_at = :completed_at,
                        error_message = NULL
                    WHERE job_id = :job_id
                      AND repository_id = :repository_id
                      AND status = 'running'
                """),
                {
                    "total_chunks": total_chunks,
                    "completed_at": metadata.indexed_at.isoformat(),
                    "job_id": str(job_id),
                    "repository_id": str(repository_id),
                },
            )

            if result.rowcount != 1:
                raise IndexJobStateChangedError("Indexing job is no longer running")

            # Publish the active index only after claiming the job.
            # A failure here rolls back the job completion too.
            connection.execute(
                self._upsert_statement(),
                self._parameters(metadata),
            )

        return metadata

    def get(
        self,
        repository_id: UUID,
    ) -> RepositoryIndexMetadata | None:
        with self.engine.connect() as connection:
            row = (
                connection.execute(
                    text("""
                    SELECT
                        repository_id,
                        commit_sha,
                        indexed_at,
                        index_version,
                        azure_ready,
                        embedding_model
                    FROM repository_indexes
                    WHERE repository_id = :repository_id
                """),
                    {"repository_id": str(repository_id)},
                )
                .mappings()
                .first()
            )

        if row is None:
            return None

        return RepositoryIndexMetadata.model_validate(dict(row))
