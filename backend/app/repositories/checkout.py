import re
import threading
from pathlib import Path
from uuid import UUID

from app.core import get_settings
from app.repositories.models import Repository
from app.repositories.validation import (
    InvalidRepositoryError,
    validate_repository_path,
)
from app.storage.repository_snapshots import (
    AzureRepositorySnapshotStore,
    RepositorySnapshotError,
)

MANAGED_DIRECTORY = re.compile(r"^github-[0-9a-f]{32}$")

_restore_lock = threading.Lock()


class RepositoryCheckoutUnavailableError(RuntimeError):
    pass


def _managed_directory_name(stored_path: str) -> str | None:
    # Handles both Windows and Linux paths stored in PostgreSQL.
    normalized = stored_path.replace("\\", "/")
    name = normalized.rstrip("/").rsplit("/", 1)[-1]

    if not MANAGED_DIRECTORY.fullmatch(name):
        return None

    try:
        UUID(hex=name.removeprefix("github-"))
    except ValueError:
        return None

    return name


def ensure_repository_checkout(
    repository: Repository,
) -> Path:
    """
    Return a validated local checkout.

    Restore missing managed GitHub imports from Blob Storage.
    Never restore or overwrite arbitrary local repositories.
    """
    stored_path = repository.path
    managed_name = _managed_directory_name(stored_path)

    if managed_name is None:
        try:
            return validate_repository_path(stored_path)
        except InvalidRepositoryError as exc:
            raise RepositoryCheckoutUnavailableError(
                "The local repository is unavailable. "
                "Only managed GitHub imports can be restored."
            ) from exc

    workspace = (
        Path(get_settings().resolved_github_workspace_dir).expanduser().resolve()
    )

    workspace.mkdir(parents=True, exist_ok=True)

    checkout_path = workspace / managed_name

    with _restore_lock:
        if checkout_path.exists() or checkout_path.is_symlink():
            try:
                return validate_repository_path(str(checkout_path))
            except InvalidRepositoryError as exc:
                raise RepositoryCheckoutUnavailableError(
                    "Managed repository checkout exists but "
                    "is invalid. Refusing to overwrite it."
                ) from exc

        try:
            snapshot_store = AzureRepositorySnapshotStore()

            snapshot_store.restore(
                repository_directory=managed_name,
                destination=checkout_path,
            )

            return validate_repository_path(str(checkout_path))

        except (
            RepositorySnapshotError,
            InvalidRepositoryError,
            OSError,
            ValueError,
        ) as exc:
            raise RepositoryCheckoutUnavailableError(
                "Could not restore the GitHub repository from Azure Blob Storage."
            ) from exc
