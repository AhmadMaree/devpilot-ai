from pathlib import Path
from uuid import UUID

from app.core import get_settings


def get_repository_index_path(
    repository_id: UUID,
    index_version: str | None = None,
) -> Path:
    indexes_root: Path = get_settings().indexes_dir

    repository_root = indexes_root / str(repository_id)
    if index_version is None:
        return repository_root / "index.json"

    version_id = UUID(index_version)
    return repository_root / f"{version_id}.json"
