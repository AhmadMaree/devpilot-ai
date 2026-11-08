
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.storage.database import get_database_engine

from .models import PatchProposal


class PostgresPatchProposalStore:
    """PostgreSQL-backed patch proposal persistence."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = (
            engine if engine is not None else get_database_engine()
        )

    def initialize(self) -> None:
        """Database schema is managed by Alembic."""
        return None

    def create(
        self,
        proposal: PatchProposal,
        *,
        diff: str | None = None,
    ) -> dict:
        self.initialize()

        proposal_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        with self.engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO patch_proposals (
                        id,
                        repository_id,
                        file_path,
                        expected_sha256,
                        replacement_content,
                        explanation,
                        status,
                        created_at,
                        diff
                    )
                    VALUES (
                        :id,
                        :repository_id,
                        :file_path,
                        :expected_sha256,
                        :replacement_content,
                        :explanation,
                        'pending',
                        :created_at,
                        :diff
                    )
                """),
                {
                    "id": proposal_id,
                    "repository_id": str(proposal.repository_id),
                    "file_path": proposal.file_path,
                    "expected_sha256": proposal.expected_sha256,
                    "replacement_content": proposal.replacement_content,
                    "explanation": proposal.explanation,
                    "created_at": created_at,
                    "diff": diff,
                },
            )

        return {
            "id": proposal_id,
            "status": "pending",
            "created_at": created_at,
        }

    def get(self, proposal_id: str) -> dict | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT
                        id,
                        repository_id,
                        file_path,
                        expected_sha256,
                        replacement_content,
                        explanation,
                        status,
                        created_at,
                        diff
                    FROM patch_proposals
                    WHERE id = :proposal_id
                """),
                {"proposal_id": proposal_id},
            ).mappings().first()

        return dict(row) if row is not None else None

    def set_status(
        self,
        proposal_id: str,
        expected_status: str,
        new_status: str,
    ) -> bool:
        """
        Atomically change status only if it matches expected_status.

        This prevents concurrent requests from claiming
        the same proposal more than once.
        """
        with self.engine.begin() as connection:
            result = connection.execute(
                text("""
                    UPDATE patch_proposals
                    SET status = :new_status
                    WHERE id = :proposal_id
                      AND status = :expected_status
                """),
                {
                    "proposal_id": proposal_id,
                    "expected_status": expected_status,
                    "new_status": new_status,
                },
            )

        return result.rowcount == 1

    def claim_for_apply(self, propsal_id: str) -> bool:
        """
        Claim a pending proposal for application.

        The parameter spelling is retained for compatibility
        with the existing SQLite implementation.
        """
        return self.set_status(
            proposal_id=propsal_id,
            expected_status="pending",
            new_status="applying",
        )

    def list_by_repository(
        self,
        repository_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")

        if offset < 0:
            raise ValueError("offset must not be negative")

        with self.engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        id,
                        repository_id,
                        file_path,
                        explanation,
                        status,
                        created_at
                    FROM patch_proposals
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
            ).mappings().all()

        return [dict(row) for row in rows]
