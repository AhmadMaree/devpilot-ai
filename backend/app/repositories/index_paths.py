from pathlib import Path
from uuid import UUID

INDEXES_ROOT = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "indexes"
)


def get_repository_index_path(
    repository_id: UUID,
    index_version: str | None = None,
) -> Path:
    repository_root = INDEXES_ROOT / str(repository_id)
    if index_version is None:
        return repository_root / "index.json"

    version_id = UUID(index_version)
    return repository_root / f"{version_id}.json"