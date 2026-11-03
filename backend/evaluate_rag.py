from pathlib import Path

from app.retrieval.local_index import LocalVectorIndex
from app.evaluation.models import EvaluationDataset, EvaluationReport
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.evaluation.runner import evaluate_method, semantic_retriever, keyword_retriever

BASE_DIR = Path(__file__).resolve().parent
TOP_K = 5


def main() -> None:
    index_path = BASE_DIR / "data" / "local_index.json"
    dataset_path = BASE_DIR / "evaluation" / "questions.json"

    index = LocalVectorIndex.load(index_path)

    print(f"Loaded local index from: {dataset_path}")

    dataset = EvaluationDataset.model_validate_json(
        dataset_path.read_text(encoding="utf-8")
    )

    if not index.items:
        raise RuntimeError(
            f"Local index is empty. Please run "
            f"`python {BASE_DIR.parent.parent}/build_local_index.py`"
        )

    indexed_paths = {item.chunk.file_path for item in index.items}

    for case in dataset.cases:
        missing_files = set(case.relative_files) - indexed_paths
        if missing_files:
            raise RuntimeError(
                f"Missing files in local index for case {case.id}: "
                f"{', '.join(missing_files)}"
            )

    embeddings = OllamaEmbeddingProvider()

    semantic = evaluate_method(
        cases=dataset.cases,
        method="semantic",
        retrieve=semantic_retriever(index=index, embeddings=embeddings, top_k=TOP_K),
        top_k=TOP_K,
    )

    keyword = evaluate_method(
        cases=dataset.cases,
        method="keyword",
        retrieve=keyword_retriever(index=index, top_k=TOP_K),
        top_k=TOP_K,
    )

    ##check commit revision
    commits = {item.chunk.commit_sha for item in index.items}

    if len(commits) != 1:
        raise RuntimeError(
            f"Local index contains multiple commit revisions: {', '.join(commits)}"
        )

    report = EvaluationReport(
        commit_sha=next(iter(commits)), top_k=TOP_K, semantic=semantic, keyword=keyword
    )

    report_path = BASE_DIR / "reports" / "retrieval_evaluation.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    report_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")

    for summary in [semantic, keyword]:
        print(f"\n{summary.method.upper()}")
        print(f"Recall@{TOP_K}: {summary.mean_recall_at_k:.3f}")
        print(f"MRR@{TOP_K}: {summary.mrr_at_k:.3f}")
        print(f"Mean Latency (ms): {summary.mean_latency_ms:.2f}")
        print("-" * 40)

    print(f"\nEvaluation report saved to: {report_path}")


if __name__ == "__main__":
    main()
