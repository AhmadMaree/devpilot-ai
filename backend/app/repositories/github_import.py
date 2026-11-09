import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

from app.core import get_settings

from typing import Protocol

from .models import Repository
from .validation import InvalidRepositoryError, validate_repository_path

from app.storage.repository_snapshots import (
    AzureRepositorySnapshotStore,
    RepositorySnapshotError,
)


class GitHubImportError(Exception):
    pass


class RepositoryWriter(Protocol):
    def create(self, name: str, path: Path) -> Repository:
        ...

REPOSITORY_COMPONENT = re.compile(r"^[A-Za-z0-9_.-]+$")


def parse_github_repository_url(url: str) -> tuple[str, str]:
    """Accept only HTTPS Github repository"""

    try:
        parsed = urlsplit(url.strip())
    except ValueError:
        raise GitHubImportError("Invaild Github URL.")

    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.netloc != "github.com"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise GitHubImportError("Only HTTPS github.com repository URLs are supported")

    parts = parsed.path.strip("/").split("/")

    if len(parts) != 2:
        raise GitHubImportError("Expected https://github.com/owner/repository")

    owner, repository = parts

    repository = repository.removesuffix(".git")

    if not all(
        REPOSITORY_COMPONENT.fullmatch(part) and part not in {".", ".."}
        for part in (owner, repository)
    ):
        raise GitHubImportError("Invalid repository owner or name")

    return owner, repository


def import_public_github_repository(
    url: str,
    store: RepositoryWriter,
    workspace: Path | None = None,
):
    owner, repository_name = parse_github_repository_url(url)

    # check this is a publich repository.

    try:
        with httpx.Client(
            timeout=15, follow_redirects=False, trust_env=False
        ) as client:
            response = client.get(
                f"https://api.github.com/repos/{owner}/{repository_name}",
                headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )

            response.raise_for_status()
            github_repository = response.json()

    except (ValueError, httpx.HTTPError):
        raise GitHubImportError("Could not verify the public Github repository")

    if (
        github_repository.get("private") is not False
        or github_repository.get("full_name", "").lower()
        != f"{owner}/{repository_name}".lower()
    ):
        raise GitHubImportError(
            "Repository is not public or does not match the requested URL"
        )

    if workspace is None:
        workspace = get_settings().resolved_github_workspace_dir
    workspace = Path(workspace)
    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    destination = workspace / f"github-{uuid4().hex}"

    clone_url = f"https://github.com/{owner}/{repository_name}.git"

    environment = os.environ.copy()
    environment["GIT_TERMINAL_PROMPT"] = "0"
    environment["GIT_CONFIG_NOSYSTEM"] = "1"
    environment["GIT_CONFIG_GLOBAL"] = os.devnull
    environment["GIT_LFS_SKIP_SMUDGE"] = "1"
    environment["GIT_CONFIG_COUNT"] = "2"
    environment["GIT_CONFIG_KEY_0"] = "protocol.file.allow"
    environment["GIT_CONFIG_VALUE_0"] = "never"
    environment["GIT_CONFIG_KEY_1"] = "credential.helper"
    environment["GIT_CONFIG_VALUE_1"] = ""

    registered = False
    snapshot_uploaded = False
    snapshot_store = None

    try:
        subprocess.run(
            [
                "git",
                "-c",
                "core.hooksPath=" + os.devnull,
                "clone",
                "--depth",
                "1",
                "--single-branch",
                "--no-tags",
                "--no-recurse-submodules",
                clone_url,
                str(destination),
            ],
            check=True,
            timeout=120,
            capture_output=True,
            text=True,
            env=environment,
            stdin=subprocess.DEVNULL,
        )

        validated_path = validate_repository_path(str(destination))
        blob_enabled = (
            os.getenv("AZURE_BLOB_ENABLED", "false")
            .strip()
            .lower()
            == "true"
        )

        if blob_enabled:
            snapshot_store = AzureRepositorySnapshotStore()
            snapshot_store.upload(validated_path)
            snapshot_uploaded = True

        result = store.create(
            name=f"{owner}/{repository_name}",
            path=validated_path,
        )

        registered = True
        return result

    except subprocess.TimeoutExpired as exc:
        raise GitHubImportError("GitHub clone timed out") from exc
    except RepositorySnapshotError as exc:
        raise GitHubImportError(
            "Could not persist the GitHub repository snapshot"
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise GitHubImportError("Cann't clone the github repository") from exc
    except (InvalidRepositoryError, OSError) as exc:
        raise GitHubImportError("Could not import the repository") from exc

    finally:
        if not registered:
            if snapshot_uploaded and snapshot_store is not None:
                try:
                    snapshot_store.delete(destination.name)
                except Exception:
                    # An orphaned snapshot may remain.
                    # It is not registered in PostgreSQL.
                    pass
            if destination.exists():
                shutil.rmtree(destination)
