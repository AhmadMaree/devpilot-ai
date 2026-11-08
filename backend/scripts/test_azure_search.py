import hashlib
import os

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from dotenv import load_dotenv

from app.embeddings.ollama import OllamaEmbeddingProvider
from app.retrieval.azure_schema import INDEX_NAME, VECTOR_DIMENSIONS

TEST_REPOSITORY_ID = "devpilot-azure-demo"
TEST_CODE = """
def validate_access_token(token: str) -> bool:
    if not token:
        return False

    return token.startswith("Bearer ")
""".strip()


def main() -> None:
    load_dotenv()

    endpoint = os.getenv("AZURE_SEARCH_ENDPOINT").strip().strip('"')
    admin_key = os.getenv("AZURE_SEARCH_ADMIN_KEY").strip()
    index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", INDEX_NAME)

    client = SearchClient(
        endpoint=endpoint,
        index_name=index_name,
        credential=AzureKeyCredential(admin_key),
    )

    embeddings = OllamaEmbeddingProvider()

    # Step A: Generate an embedding for our code.
    code_vector = embeddings.embed_texts([TEST_CODE])[0]

    if len(code_vector) != VECTOR_DIMENSIONS:
        raise ValueError(
            f"Expected {VECTOR_DIMENSIONS} dimensions, got {len(code_vector)}"
        )

    # Step B: Create a synthetic search document.
    document = {
        "id": "devpilot-azure-demo-auth-001",
        "repository_id": TEST_REPOSITORY_ID,
        "commit_sha": "demo",
        "file_path": "app/auth/token.py",
        "language": "python",
        "start_line": 1,
        "end_line": 5,
        "content": TEST_CODE,
        "content_sha256": hashlib.sha256(TEST_CODE.encode("utf-8")).hexdigest(),
        "content_vector": code_vector,
    }

    # Step C: Upload to Azure AI Search.
    results = client.upload_documents(documents=[document])

    for result in results:
        if not result.succeeded:
            raise RuntimeError(f"Document upload failed: {result.key}")
        print(f"Uploaded document: {result.key}")

    # Step D: Embed the user's question.
    question = "Where is the access token validated?"
    query_vector = embeddings.embed_texts([question])[0]

    # Step E: Perform hybrid search.
    search_results = client.search(
        search_text=question,
        vector_queries=[
            VectorizedQuery(
                vector=query_vector,
                k_nearest_neighbors=5,
                fields="content_vector",
            )
        ],
        filter=f"repository_id eq '{TEST_REPOSITORY_ID}'",
        select=[
            "id",
            "repository_id",
            "file_path",
            "content",
            "start_line",
            "end_line",
        ],
        top=5,
    )

    print("\nSearch results:")

    found = False
    for result in search_results:
        found = True
        print(f"File: {result['file_path']}")
        print(f"Score: {result['@search.score']}")
        print(f"Content:\n{result['content']}\n")

    if not found:
        raise RuntimeError("No results returned. Check indexing status and retry.")


if __name__ == "__main__":
    main()
