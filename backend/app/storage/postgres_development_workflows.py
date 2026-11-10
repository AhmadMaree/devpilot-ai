import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.storage.database import get_database_engine


class PostgresDevelopmentWorkflowStore:
    """PostgreSQL-backed development workflow persistence."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine if engine is not None else get_database_engine()

    def initialize(self) -> None:
        """Alembic manages database schema creation."""
        return

    def create(
        self,
        *,
        repository_id: UUID,
        file_path: str,
        instruction: str,
        status: str,
        response: dict,
        proposal_id: UUID | None = None,
    ) -> dict:
        workflow_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        with self.engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO development_workflows (
                        id,
                        repository_id,
                        file_path,
                        instruction,
                        status,
                        proposal_id,
                        created_at,
                        response_json
                    )
                    VALUES (
                        :id,
                        :repository_id,
                        :file_path,
                        :instruction,
                        :status,
                        :proposal_id,
                        :created_at,
                        :response_json
                    )
                """),
                {
                    "id": workflow_id,
                    "repository_id": str(repository_id),
                    "file_path": file_path,
                    "instruction": instruction,
                    "status": status,
                    "proposal_id": (str(proposal_id) if proposal_id else None),
                    "created_at": created_at,
                    "response_json": json.dumps(response),
                },
            )

        return {
            "id": workflow_id,
            "repository_id": str(repository_id),
            "file_path": file_path,
            "instruction": instruction,
            "status": status,
            "proposal_id": (str(proposal_id) if proposal_id else None),
            "created_at": created_at,
            "response": response,
        }

    def list_by_repository(
        self,
        repository_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")

        if offset < 0:
            raise ValueError("offset cannot be negative")

        with self.engine.connect() as connection:
            rows = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        repository_id,
                        file_path,
                        instruction,
                        status,
                        proposal_id,
                        created_at
                    FROM development_workflows
                    WHERE repository_id = :repository_id
                    ORDER BY created_at DESC, id DESC
                    LIMIT :limit
                    OFFSET :offset
                """),
                    {
                        "repository_id": str(repository_id),
                        "limit": limit,
                        "offset": offset,
                    },
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def get(
        self,
        workflow_id: UUID,
    ) -> dict | None:
        with self.engine.connect() as connection:
            row = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        repository_id,
                        file_path,
                        instruction,
                        status,
                        proposal_id,
                        created_at,
                        response_json
                    FROM development_workflows
                    WHERE id = :workflow_id
                """),
                    {
                        "workflow_id": str(workflow_id),
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None

        result = dict(row)
        result["response"] = json.loads(result.pop("response_json"))

        return result
