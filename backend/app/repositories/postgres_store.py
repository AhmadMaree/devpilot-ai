from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.storage.database import get_database_engine

from .models import Repository


class PostgresRepositoryStore:
    """PostgreSQL implementation of repository persistence."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine or get_database_engine()

    def initialize(self) -> None:
        """
        Schema creation is handled by Alembic.

        This method is retained for compatibility with
        the existing RepositoryStore interface.
        """
        return

    def create(self, name: str, path: Path) -> Repository:
        self.initialize()

        repository = Repository(
            id=uuid4(),
            name=name,
            path=str(path),
            created_at=datetime.now(UTC),
        )

        with self.engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO repositories (
                        id,
                        name,
                        path,
                        created_at
                    )
                    VALUES (
                        :id,
                        :name,
                        :path,
                        :created_at
                    )
                """),
                {
                    "id": str(repository.id),
                    "name": repository.name,
                    "path": repository.path,
                    "created_at": repository.created_at.isoformat(),
                },
            )

        return repository

    def list_all(self) -> list[Repository]:
        self.initialize()

        with self.engine.connect() as connection:
            rows = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        name,
                        path,
                        created_at
                    FROM repositories
                    ORDER BY created_at DESC
                """)
                )
                .mappings()
                .all()
            )

        return [Repository.model_validate(dict(row)) for row in rows]

    def get(self, repository_id: UUID) -> Repository | None:
        self.initialize()

        with self.engine.connect() as connection:
            row = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        name,
                        path,
                        created_at
                    FROM repositories
                    WHERE id = :repository_id
                """),
                    {
                        "repository_id": str(repository_id),
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None

        return Repository.model_validate(dict(row))

    def delete(self, repository_id: UUID) -> bool:
        self.initialize()

        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    DELETE FROM repositories
                    WHERE id = :repository_id
                """),
                {
                    "repository_id": str(repository_id),
                },
            )

        return result.rowcount > 0
