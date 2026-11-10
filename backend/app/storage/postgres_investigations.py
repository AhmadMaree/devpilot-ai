import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.agents.models import InvestigationResponse
from app.storage.database import get_database_engine


class PostgresInvestigationStore:
    """PostgreSQL-backed investigation persistence."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine if engine is not None else get_database_engine()

    def initialize(self) -> None:
        """Alembic manages database schema creation."""
        return

    def save(self, result: InvestigationResponse) -> dict:
        investigation_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        # Preserve the existing JSON representation.
        response_json = result.model_dump_json()

        with self.engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO investigations (
                        id,
                        repository_id,
                        question,
                        review_passed,
                        created_at,
                        response_json
                    )
                    VALUES (
                        :id,
                        :repository_id,
                        :question,
                        :review_passed,
                        :created_at,
                        :response_json
                    )
                """),
                {
                    "id": investigation_id,
                    "repository_id": str(result.repository_id),
                    "question": result.question,
                    "review_passed": int(result.review_passed),
                    "created_at": created_at,
                    "response_json": response_json,
                },
            )

        return {
            "id": investigation_id,
            "created_at": created_at,
            "result": result.model_dump(mode="json"),
        }

    def list_recent(self, limit: int = 20) -> list[dict]:
        if limit < 0:
            raise ValueError("limit must not be negative")

        with self.engine.connect() as connection:
            rows = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        repository_id,
                        question,
                        review_passed,
                        created_at,
                        response_json
                    FROM investigations
                    ORDER BY created_at DESC, id DESC
                    LIMIT :limit
                """),
                    {"limit": limit},
                )
                .mappings()
                .all()
            )

        # Preserve the existing list_recent() contract:
        # response_json remains a JSON string, not a dict.
        return [dict(row) for row in rows]

    def get_investigation(
        self,
        investigation_id: str,
    ) -> dict | None:
        with self.engine.connect() as connection:
            row = (
                connection.execute(
                    text("""
                    SELECT
                        id,
                        created_at,
                        response_json
                    FROM investigations
                    WHERE id = :investigation_id
                """),
                    {"investigation_id": investigation_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            return None

        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "result": json.loads(row["response_json"]),
        }

    def get(self, investigation_id: str) -> dict | None:
        return self.get_investigation(investigation_id)
