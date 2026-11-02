
import pytest

from app.chunking.models import SourceChunk
from app.evaluation.keyword import BM25Retriever
from app.evaluation.metrics import (
    recall_at_k,
    reciprocal_rank,
)
from app.retrieval.local_index import LocalVectorIndex


def make_chunk(chunk_id: str, path: str, content: str):
    return SourceChunk(
        chunk_id=chunk_id,
        repository_id="demo-repository",
        commit_sha="a" * 40,
        file_path=path,
        language="python",
        start_line=1,
        end_line=1,
        content=content,
        content_sha256="test",
    )


def test_recall_at_k():
    assert recall_at_k(
        ["a.py", "b.py"],
        ["a.py", "c.py"],
        2,
    ) == pytest.approx(0.5)


def test_reciprocal_rank():
    assert reciprocal_rank(
        ["x.py", "b.py", "a.py"],
        ["a.py"],
        3,
    ) == pytest.approx(1 / 3)


def test_missing_relevant_files():
    assert recall_at_k(
        ["x.py"],
        ["a.py"],
        5,
    ) == 0.0

    assert reciprocal_rank(
        ["x.py"],
        ["a.py"],
        5,
    ) == 0.0


def test_bm25_finds_matching_file():
    index = LocalVectorIndex()

    index.add(
        [
            make_chunk(
                "one",
                "ingestion.py",
                "repository ingestion scanning",
            ),
            make_chunk(
                "two",
                "auth.py",
                "user authentication login",
            ),
        ],
        [[1.0, 0.0], [0.0, 1.0]],
    )

    retriever = BM25Retriever(index.items)

    results = retriever.search(
        "repository ingestion",
        "demo-repository",
        limit=1,
    )

    assert results[0][0] == "ingestion.py"
