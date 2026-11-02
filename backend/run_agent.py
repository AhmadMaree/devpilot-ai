from pathlib import Path
from app.agents.graph import build_investigation_graph
from app.agents.retriever import RepositoryRetriever
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.rag.ollama import OllamaChatProvider
from app.retrieval.local_index import LocalVectorIndex


BASE_DIR = Path(__file__).resolve().parent

def main() -> None:
    index_path = BASE_DIR /  "data"  / "local_index.json"
    if not index_path.is_file():
        raise FileNotFoundError(
            "Local index missing. Run build_local_index.py first."
        )

    index = LocalVectorIndex.load(index_path)
    retriever = RepositoryRetriever(
        index=index,
        embeddings=OllamaEmbeddingProvider()
    )

    analyst = OllamaChatProvider()
    
    graph = build_investigation_graph(
        retriever=retriever,
        analyst=analyst
    )

    result = graph.invoke(
        {
            "question": "Where is repository ingestion implemented?",
            "repository_id": "demo-repository",
            "plan": "",
            "evidence": [],
            "answer": "", 
            "review_passed": False
        }
    )

    print("\nPlan:", result["plan"])
    print("\nAnswer:", result["answer"])
    print("\nources:")
    for item in result["evidence"]:
        print(
            f"[{item['source_id']}] "
            f"{item['file_path']}:"
            f"{item['start_line']}-{item['end_line']}"
        )
    print("\nREVIEW")
    print("Passed:", result["review_passed"])
    print("Feedback:", result["review_feedback"])

if __name__ == "__main__":
    main()