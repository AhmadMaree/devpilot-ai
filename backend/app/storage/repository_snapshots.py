
import os
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient


MAX_FILES = 20000
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_ARCHIVE_BYTES = 100 * 1024 * 1024


class RepositorySnapshotError(RuntimeError):
    pass


class AzureRepositorySnapshotStore:
    def __init__(self) -> None:
        connection_string = os.getenv(
            "AZURE_STORAGE_CONNECTION_STRING", ""
        ).strip()

        if not connection_string:
            raise RepositorySnapshotError(
                "Azure Storage connection string is missing"
            )

        self.client = BlobServiceClient.from_connection_string(
            connection_string
        )

        self.container = self.client.get_container_client(
            os.getenv(
                "AZURE_BLOB_REPOSITORY_CONTAINER",
                "devpilot-repositories",
            )
        )

    @staticmethod
    def blob_name(repository_directory: str) -> str:
        # GitHub imports use github-<32-character-UUID>.
        if (
            not repository_directory.startswith("github-")
            or len(repository_directory) != 39
        ):
            raise RepositorySnapshotError(
                "Invalid managed repository directory"
            )

        import uuid

        try:
            uuid.UUID(hex=repository_directory[7:])
        except ValueError as exc:
            raise RepositorySnapshotError(
                "Invalid repository identifier"
            ) from exc

        return f"repositories/{repository_directory}/source.tar.gz"

    def upload(self, repository_path: Path, *, overwrite: bool = False,) -> str:
        repository_path = Path(repository_path).resolve(
            strict=True
        )

        blob_name = self.blob_name(repository_path.name)

        count = 0
        total_size = 0

        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "source.tar.gz"

            with tarfile.open(
                archive_path, mode="w:gz"
            ) as archive:
                for path in sorted(repository_path.rglob("*")):
                    if path.is_symlink():
                        raise RepositorySnapshotError(
                            "Repository contains symbolic links"
                        )

                    if not path.is_file() and not path.is_dir():
                        raise RepositorySnapshotError(
                            "Unsupported repository file type"
                        )

                    if path.is_file():
                        count += 1
                        total_size += path.stat().st_size

                        if (
                            count > MAX_FILES
                            or total_size > MAX_UNCOMPRESSED_BYTES
                        ):
                            raise RepositorySnapshotError(
                                "Repository exceeds snapshot limits"
                            )

                    relative = path.relative_to(
                        repository_path
                    ).as_posix()

                    archive.add(
                        path,
                        arcname=relative,
                        recursive=False,
                    )

            if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
                raise RepositorySnapshotError(
                    "Compressed repository exceeds 100 MiB"
                )

            blob = self.container.get_blob_client(blob_name)

            with archive_path.open("rb") as stream:
                blob.upload_blob(stream, overwrite=overwrite)

        return blob_name

    def restore(
        self,
        repository_directory: str,
        destination: Path,
    ) -> Path:
        blob_name = self.blob_name(repository_directory)
        destination = Path(destination).resolve()

        if destination.name != repository_directory:
            raise RepositorySnapshotError(
                "Restore destination does not match repository"
            )

        if destination.exists():
            raise RepositorySnapshotError(
                "Restore destination already exists"
            )

        blob = self.container.get_blob_client(blob_name)

        with tempfile.TemporaryDirectory(
            dir=destination.parent
        ) as temp_dir:
            temp_root = Path(temp_dir)
            archive_path = temp_root / "source.tar.gz"
            extraction_root = temp_root / "extracted"
            extraction_root.mkdir()

            properties = blob.get_blob_properties()

            if properties.size > MAX_ARCHIVE_BYTES:
                raise RepositorySnapshotError(
                    "Stored repository snapshot is too large"
                )

            with archive_path.open("wb") as stream:
                downloader = blob.download_blob()
                for chunk in downloader.chunks():
                    stream.write(chunk)
                    if stream.tell() > MAX_ARCHIVE_BYTES:
                        raise RepositorySnapshotError(
                            "Downloaded archive exceeds size limit"
                        )

            count = 0
            total_size = 0

            with tarfile.open(
                archive_path, mode="r:gz"
            ) as archive:
                members = archive.getmembers()

                # Validate the entire archive before extracting.
                for member in members:
                    relative = PurePosixPath(member.name)

                    if (
                        relative.is_absolute()
                        or ".." in relative.parts
                        or not relative.parts
                        or not (
                            member.isfile()
                            or member.isdir()
                        )
                    ):
                        raise RepositorySnapshotError(
                            "Unsafe repository archive entry"
                        )

                    if member.isfile():
                        count += 1
                        total_size += member.size

                    if (
                        count > MAX_FILES
                        or total_size > MAX_UNCOMPRESSED_BYTES
                    ):
                        raise RepositorySnapshotError(
                            "Repository exceeds restore limits"
                        )

                # Extract regular files manually.
                for member in members:
                    target = extraction_root.joinpath(
                        *PurePosixPath(member.name).parts
                    )

                    if member.isdir():
                        target.mkdir(
                            parents=True,
                            exist_ok=True,
                        )
                        continue

                    target.parent.mkdir(
                        parents=True,
                        exist_ok=True,
                    )

                    source = archive.extractfile(member)

                    if source is None:
                        raise RepositorySnapshotError(
                            "Missing archive file content"
                        )

                    with source, target.open("xb") as output:
                        import shutil
                        copied = shutil.copyfileobj(
                            source,
                            output,
                            length=1024 * 1024,
                        )

            # Same filesystem: move the completed directory
            # into place only after successful extraction.
            extraction_root.rename(destination)

        return destination

    def delete(self, repository_directory: str) -> None:
        blob = self.container.get_blob_client(
            self.blob_name(repository_directory)
        )

        try:
            blob.delete_blob()
        except ResourceNotFoundError:
            pass

    def upload_updated_checkout(
        self,
        repository_path: Path,
    ) -> str:
        """
        Persist a modified managed GitHub checkout.

        The existing upload() method retains the archive
        validation and repository size limits.
        """
        repository_path = Path(repository_path)

        if not (repository_path / ".git").exists():
            raise RepositorySnapshotError(
                "Cannot persist a checkout without Git metadata"
            )

        return self.upload(
            repository_path=repository_path,
            overwrite=True,
        )