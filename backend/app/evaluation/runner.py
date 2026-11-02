from time import perf_counter

from app.evaluation.models import EvaluationCase
from app.evaluation.models import RetrievalSummary , CaseResult
from app.evaluation.metrics import recall_at_k, reciprocal_rank, mean

from app.retrieval.local_index import LocalVectorIndex
from app.evaluation.keyword import BM25Retriever

def unique_paths(paths: list[str]) -> list[str]:
    return list(dict.fromkeys(paths))

def evaluate_method(
    cases: list[EvaluationCase],
    method: str,
    retrieve,
    top_k: int = 5
) -> RetrievalSummary:

    results = []

    for case in cases:
        start = perf_counter()

        paths = unique_paths(retrieve(case.question, case.repository_id))[:top_k]

        latency_ms = (perf_counter() - start) * 1000

        results.append(
            CaseResult(
                id= case.id,
                question= case.question,
                expected_files= case.relative_files,
                retrieved_files= paths,
                recall_at_k= recall_at_k(
                    retrieved_files= paths,
                    relevant_files= case.relative_files,
                    k= top_k
                ),
                reciprocal_rank= reciprocal_rank(
                    retrieved_files= paths,
                    relevant_files= case.relative_files,
                    k= top_k
                ),
                latency_ms= latency_ms
            )
        )

    return RetrievalSummary(
        results=results,
        method=method,
        cases=len(results),
        mean_recall_at_k= mean([r.recall_at_k for r in results]),
        mrr_at_k= mean([r.reciprocal_rank for r in results]),
        mean_latency_ms= mean([r.latency_ms for r in results])
    )


def semantic_retriever(index, embeddings, top_k=5):
    def retrieve(query: str, repository_id: str | None = None):
        vector = embeddings.embed_texts([query])[0]
        results = index.serach(
            query_search=vector,
            limit=top_k,
            repo_id=repository_id
        )

        return unique_paths([result.chunk.file_path for result in results])[:top_k]

    return retrieve
    

def keyword_retriever(index: LocalVectorIndex, top_k=5):
    bm25 = BM25Retriever(items = index.items)
    def retrieve(question: str, repository_id: str | None = None):
        return [
            path
            for path, _ in bm25.search(
                query=question,
                repository_id=repository_id,
                limit=top_k
            )
        ]

    return retrieve

