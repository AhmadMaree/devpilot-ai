
import os
import sys
from pathlib import Path

from azure.core.exceptions import AzureError
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")


def main() -> int:
    connection_string = os.getenv(
        "AZURE_STORAGE_CONNECTION_STRING", ""
    ).strip()

    if not connection_string:
        print(
            "ERROR: AZURE_STORAGE_CONNECTION_STRING "
            "is not configured."
        )
        return 1

    containers = [
        os.getenv(
            "AZURE_BLOB_INDEX_CONTAINER",
            "devpilot-indexes",
        ),
        os.getenv(
            "AZURE_BLOB_REPOSITORY_CONTAINER",
            "devpilot-repositories",
        ),
    ]

    try:
        with BlobServiceClient.from_connection_string(
            connection_string
        ) as client:
            for container_name in containers:
                container = client.get_container_client(
                    container_name
                )

                if not container.exists():
                    print(
                        f"ERROR: Container '{container_name}' "
                        "does not exist or is inaccessible."
                    )
                    return 1

                print(f"OK: {container_name}")

    except (AzureError, ValueError, OSError) as exc:
        print(
            "ERROR: Azure Blob connection failed "
            f"({type(exc).__name__})."
        )
        return 1

    print("Azure Blob container access verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
