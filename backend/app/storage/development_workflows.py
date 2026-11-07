import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from app.core.config import get_settings


class DevelopmentWorkflowStore:
    def __init__(
        self,
        db_path: Path | str | None = None,
    ):
        self.db_path = Path(
            db_path if db_path is not None else get_settings().database_path
        )

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        connection = sqlite3.connect(
            str(self.db_path),
            timeout=10,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")

        return connection

    def initialize(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS development_workflows (
                    id TEXT PRIMARY KEY,
                    repository_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    instruction TEXT NOT NULL,
                    status TEXT NOT NULL,
                    proposal_id TEXT,
                    created_at TEXT NOT NULL,
                    response_json TEXT NOT NULL
                )
                """
            )

            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS
                idx_development_workflows_repository
                ON development_workflows(
                    repository_id,
                    created_at DESC
                )
                """
            )

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
        self.initialize()

        workflow_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    workflow_id,
                    str(repository_id),
                    file_path,
                    instruction,
                    status,
                    str(proposal_id) if proposal_id else None,
                    created_at,
                    json.dumps(response),
                ),
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

        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    repository_id,
                    file_path,
                    instruction,
                    status,
                    proposal_id,
                    created_at
                FROM development_workflows
                WHERE repository_id = ?
                ORDER BY created_at DESC, rowid DESC
                LIMIT ? OFFSET ?
                """,
                (str(repository_id), limit, offset),
            ).fetchall()

        return [dict(row) for row in rows]

    def get(
        self,
        workflow_id: UUID,
    ) -> dict | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                """
                SELECT *
                FROM development_workflows
                WHERE id = ?
                """,
                (str(workflow_id),),
            ).fetchone()

        if row is None:
            return None

        result = dict(row)
        result["response"] = json.loads(result.pop("response_json"))

        return result
