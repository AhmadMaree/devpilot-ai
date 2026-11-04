
import subprocess
from pathlib import Path


class InvalidRepositoryError(ValueError):
    pass


def validate_repository_path(path: str) -> Path:
    try:
        root = Path(path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise InvalidRepositoryError(
            "Repository directory does not exist or cannot be resolved"
        ) from exc

    if not root.is_dir():
        raise InvalidRepositoryError(
            "Repository path must be a directory"
        )

    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "rev-parse",
                "--show-toplevel",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise InvalidRepositoryError(
            "Unable to validate the Git repository"
        ) from exc

    if result.returncode != 0:
        raise InvalidRepositoryError(
            "Directory is not inside a Git repository"
        )

    try:
        git_root = Path(result.stdout.strip()).resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise InvalidRepositoryError(
            "Git returned an invalid repository root"
        ) from exc

    if git_root != root:
        raise InvalidRepositoryError(
            "Select the Git repository root directory"
        )

    return root
