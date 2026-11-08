from azure.search.documents.indexes.models import (
    HnswAlgorithmConfiguration,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
)

INDEX_NAME = "devpilot-code-index"
VECTOR_DIMENSIONS = 768
VECTOR_PROFILE = "devpilot-hnsw-profile"


def build_code_search_index(
    index_name: str = INDEX_NAME, dimensions: int = VECTOR_DIMENSIONS
) -> SearchIndex:
    if dimensions <= 0:
        raise ValueError("Vector dimensions must be positive")
    return SearchIndex(
        name=index_name,
        fields=[
            SimpleField(
                name="id", type=SearchFieldDataType.String, key=True, filterable=True
            ),
            SimpleField(
                name="chunk_id",
                type=SearchFieldDataType.String,
            ),
            SimpleField(
                name="repository_id",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SimpleField(
                name="index_version",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SimpleField(
                name="commit_sha",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SearchableField(
                name="file_path",
                filterable=True,
            ),
            SimpleField(
                name="language",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SimpleField(
                name="start_line",
                type=SearchFieldDataType.Int32,
            ),
            SimpleField(
                name="end_line",
                type=SearchFieldDataType.Int32,
            ),
            SearchableField(
                name="content",
            ),
            SimpleField(
                name="content_sha256",
                type=SearchFieldDataType.String,
            ),
            SearchField(
                name="content_vector",
                type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                searchable=True,
                vector_search_dimensions=dimensions,
                vector_search_profile_name=VECTOR_PROFILE,
            ),
        ],
        vector_search=VectorSearch(
            algorithms=[HnswAlgorithmConfiguration(name="devpilot-hnsw")],
            profiles=[
                VectorSearchProfile(
                    name=VECTOR_PROFILE, algorithm_configuration_name="devpilot-hnsw"
                )
            ],
        ),
    )
