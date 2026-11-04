import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.storage.investigations import DEFAULT_DB_PATH

from .models import PatchProposal


class PatchProposalStore:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.db_path), timeout=10)
        connection.row_factory = sqlite3.Row
        return connection
    
    def initialize(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute("""

            CREATE TABLE IF NOT EXISTS patch_proposals(
                id TEXT PRIMARY KEY,
                repository_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                expected_sha256 TEXT NOT NULL,
                replacement_content TEXT NOT NULL,
                explanation TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """)

    def create(
        self,
        proposal: PatchProposal
    ) -> dict:
        proposal_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()
        with closing(self._connect()) as conn, conn:
            conn.execute("""
            
            INSERT INTO patch_proposals(
                id, repository_id, file_path, expected_sha256,
                replacement_content, explanation, status, created_at
            )
            VALUES (?,?,?,?,?,?,'pending',?)
            """,(
                proposal_id,proposal.repository_id,proposal.file_path,
                proposal.expected_sha256,proposal.replacement_content,
                proposal.explanation,created_at
            ))

        return {
            "id": proposal_id,
            "status": "pending",
            "created_at": created_at,
        }

    def get(
        self,
        proposal_id: str
    ) -> dict | None:
        with closing(self._connect()) as connection, connection:
            row = connection.execute("""
            SELECT * FROM patch_proposals WHERE id = ?
            """,(proposal_id,)).fetchone()

        return dict(row) if row else None

    def set_status(
        self,
        proposal_id: str,
        expected_status: str,
        new_status: str,
    ) -> bool:
        
        with closing(self._connect()) as connection, connection:
            cur = connection.execute(
                """
                UPDATE patch_proposals
                SET status = ?
                WHERE id = ? AND status = ?
                """,
                (
                    new_status,
                    proposal_id,
                    expected_status
                )
            )
        return cur.rowcount == 1

    def claim_for_apply(
        self,
        propsal_id: str
    ) -> bool:

        return self.set_status(
            proposal_id=propsal_id,
            expected_status="pending",
            new_status="applying",
        )
