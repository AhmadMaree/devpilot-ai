
import os
from pathlib import Path
from uuid import UUID

from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient


class AzureBlobIndexStore:
    def __init__(
        self,
        client: BlobServiceClient | None = None,
        container_name: str | None = None,
    ) -> None:
        self.container_name = (
            container_name
            or os.getenv(
                "AZURE_BLOB_INDEX_CONTAINER",
                "devpilot-indexes",
            )
        )

        if client is None:
            connection_string = os.getenv(
                "AZURE_STORAGE_CONNECTION_STRING",
                "",
            ).strip()

            if not connection_string:
                raise ValueError(
                    "AZURE_STORAGE_CONNECTION_STRING "
                    "is not configured"
                )

            client = BlobServiceClient.from_connection_string(
                connection_string
            )

        self.container = client.get_container_client(
            self.container_name
        )

    @staticmethod
    def blob_name(
        repository_id: UUID,
        index_version: str,
    ) -> str:
        version = UUID(index_version)

        return (
            f"repositories/{repository_id}/"
            f"indexes/{version}.json"
        )

    def upload_index(
        self,
        repository_id: UUID,
        index_version: str,
        local_path: Path,
    ) -> str:
        path = Path(local_path)

        if not path.is_file():
            raise FileNotFoundError(path)

        blob_name = self.blob_name(
            repository_id,
            index_version,
        )

        blob = self.container.get_blob_client(blob_name)

        with path.open("rb") as stream:
            blob.upload_blob(
                stream,
                overwrite=True,
                content_settings=None,
            )

        return blob_name

    def download_index(
        self,
        repository_id: UUID,
        index_version: str,
        destination: Path,
    ) -> Path:
        blob_name = self.blob_name(
            repository_id,
            index_version,
        )

        blob = self.container.get_blob_client(blob_name)

        destination = Path(destination)
        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary = destination.with_suffix(
            destination.suffix + ".download"
        )

        try:
            with temporary.open("wb") as stream:
                stream.write(
                    blob.download_blob().readall()
                )

            temporary.replace(destination)

        finally:
            temporary.unlink(missing_ok=True)

        return destination

    def index_exists(
        self,
        repository_id: UUID,
        index_version: str,
    ) -> bool:
        blob = self.container.get_blob_client(
            self.blob_name(
                repository_id,
                index_version,
            )
        )

        try:
            blob.get_blob_properties()
            return True
        except ResourceNotFoundError:
            return False

    def delete_index(
        self,
        repository_id: UUID,
        index_version: str,
    ) -> None:
        blob = self.container.get_blob_client(
            self.blob_name(
                repository_id,
                index_version,
            )
        )

        blob.delete_blob(
            delete_snapshots="include",
        )
