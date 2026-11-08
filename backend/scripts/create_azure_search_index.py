import os

from azure.core.credentials import AzureKeyCredential
from azure.search.documents.indexes import SearchIndexClient
from dotenv import load_dotenv

from app.retrieval.azure_schema import (
    INDEX_NAME,
    VECTOR_DIMENSIONS,
    build_code_search_index,
)


def main() -> None:
    load_dotenv()

    endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
    admin_key = os.getenv("AZURE_SEARCH_ADMIN_KEY")

    if not endpoint or not admin_key:
        raise RuntimeError(
            "AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY are required"
        )

    client = SearchIndexClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(admin_key),
    )

    index_name = os.environ.get(
        "AZURE_SEARCH_INDEX_NAME",
        INDEX_NAME,
    )

    index = build_code_search_index(index_name=index_name, dimensions=VECTOR_DIMENSIONS)

    existing_indexes = set(client.list_index_names())

    if index_name in existing_indexes:
        print(f"Index already exists: {index_name}")
        return

    created_index = client.create_index(index)

    print(f"Created Azure AI Search index: {created_index.name}")
    print(f"Vector dimensions: {VECTOR_DIMENSIONS}")


if __name__ == "__main__":
    main()
