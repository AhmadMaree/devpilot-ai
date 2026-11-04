import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from .models import Repository

DEFAULT_DB_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "devpilot.db"
)


class RepositoryStore:

    def __init__(
        self,
        db_path: Path = DEFAULT_DB_PATH
    ):
        self.db_path = db_path

    def _connect(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self) -> None:

        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                    CREATE TABLE IF NOT EXISTS repositories(
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        path TEXT NOT NULL UNIQUE,
                        created_at TEXT NOT NULL
                    )
                    """
            )

    def create(self, name: str, path: Path) -> Repository:
        self.initialize()

        repo = Repository(
            id=uuid4(),
            name=name,
            path=str(path),
            created_at=datetime.now(UTC),
        )

        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                    INSERT INTO repositories(id, name, path, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                (
                    str(repo.id),
                    repo.name,
                    repo.path,
                    repo.created_at.isoformat(),
                ),
            )

        return repo

    def list_all(self) -> list[Repository]:
        self.initialize()

        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT id,name,path,created_at FROM repositories
                ORDER BY created_at DESC
                """
            ).fetchall()

        return [
            Repository.model_validate(dict(row))
            for row in rows
        ]

    def get(self, repository_id: UUID) -> Repository | None:
        self.initialize()

        with closing(self._connect()) as conn:
            row = conn.execute("""
                SELECT id,name,path,created_at
                FROM repositories
                WHERE id=?
                """,
                (str(repository_id),),
            ).fetchone()

        if row is None:
            return None

        return Repository.model_validate(dict(row))

    def delete(self, repository_id: UUID) -> bool:
        self.initialize()

        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                    DELETE FROM repositories WHERE id=?
                    """,
                (str(repository_id),),
            )
            return cursor.rowcount > 0