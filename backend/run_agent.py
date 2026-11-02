from app.agents.graph import build_investigation_graph


def main() -> None:
    graph = build_investigation_graph()

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

    print("Plan:", result["plan"])
    print("Evidence:", result["evidence"])
    print("Answer:", result["answer"])
    print("Review passed:", result["review_passed"])

if __name__ == "__main__":
    main()