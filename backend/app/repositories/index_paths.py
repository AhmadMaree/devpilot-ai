from pathlib import Path
from uuid import UUID

INDEXES_ROOT = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "indexes"
)

def get_repository_index_path(repository_id: UUID) -> Path:
    return INDEXES_ROOT / str(repository_id) / "index.json"