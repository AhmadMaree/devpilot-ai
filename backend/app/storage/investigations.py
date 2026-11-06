import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.agents.models import InvestigationResponse
from app.core import get_settings


class InvestigationStore:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(
            db_path if db_path is not None else get_settings().database_path
        )

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        if self.db_path.is_dir():
            try:
                self.db_path.rmdir()
            except OSError as exc:
                raise IsADirectoryError(
                    f"Database path is a non-empty directory: {self.db_path}"
                ) from exc

        connection = sqlite3.connect(
            str(self.db_path),
            timeout=10
        )

        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")

        return connection

    def initialize(self) -> None:

        with self._connect() as conn:
            conn.execute(
                """
                    CREATE TABLE IF NOT EXISTS investigations(
                        id TEXT PRIMARY KEY,
                        repository_id TEXT NOT NULL,
                        question TEXT NOT NULL,
                        review_passed INTEGER NOT NULL,
                        created_at TEXT NOT NULL,
                        response_json TEXT NOT NULL
                    )
                """
            )

            conn.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_investigations_created_at
                ON investigations(created_at DESC)
            """)

    def save(
        self,
        result: InvestigationResponse
    ) -> dict:
        
        investigation_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO investigations(
                    id,
                    repository_id,
                    question,
                    review_passed,
                    created_at,
                    response_json
                )
                VALUES (?,?,?,?,?,?)
                """,
                (
                    investigation_id,
                    result.repository_id,
                    result.question,
                    int(result.review_passed),
                    created_at,
                    result.model_dump_json()
                )
            )

        return {
            "id": investigation_id,
            "created_at": created_at,
            "result": result.model_dump(mode="json")
        }

    def list_recent(
        self,
        limit: int = 20,
    ) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM investigations
                ORDER BY created_at DESC, rowid DESC
                LIMIT ?
                """,
                (
                    limit,
                )
            ).fetchall()

            return [
                dict(row)
                for row in rows
            ]

    def get_investigation(
        self,
        investigation_id: str
    ) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, created_at, response_json
                FROM investigations
                WHERE id = ?
                """,
                (investigation_id,),
            ).fetchone()

        if row is None:
            return None

        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "result": json.loads(row["response_json"]),
        }

    def get(self, investigation_id: str) -> dict | None:
        return self.get_investigation(investigation_id)





        
