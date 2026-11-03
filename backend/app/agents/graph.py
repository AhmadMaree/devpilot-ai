import re
from typing import TypedDict, Protocol
from langgraph.graph import START, END, StateGraph

from app.retrieval.local_index import SearchResult
from app.chunking.models import SourceChunk
from app.rag.prompts import build_user_propmt


class Retriever(Protocol):
    def search(
        self,
        question: str,
        repository_id: str,
        limit: int,
    ) -> list[SearchResult]: ...


class Analyst(Protocol):
    def generate(self, prompt: str) -> str: ...


class Evidence(TypedDict):
    source_id: str
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    commit_sha: str
    content: str


class InvestigationState(TypedDict):
    question: str
    repository_id: str
    plan: str
    evidence: list[Evidence]
    answer: str
    review_passed: bool
    review_feedback: str
    attempts: int
    max_attempts: int


def route_after_review(state: InvestigationState) -> str:
    if state["review_passed"]:
        return "end"
    if not state["evidence"]:
        return "end"
    if state["attempts"] >= state["max_attempts"]:
        return "end"

    return "retry"


def build_investigation_graph(
    retriever: Retriever,
    analyst: Analyst,
):

    def planner(state: InvestigationState) -> dict:

        question = state["question"].strip()

        return {"plan": (f"Find source-code evidence explaining:{question}")}

    def retrieve(state: InvestigationState) -> dict:
        results = retriever.search(
            question=state["question"], repository_id=state["repository_id"], limit=5
        )

        evidence: list[Evidence] = []
        for index, result in enumerate(results, start=1):
            chunk = result.chunk
            evidence.append(
                {
                    "source_id": f"S{index}",
                    "chunk_id": chunk.chunk_id,
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "commit_sha": chunk.commit_sha,
                    "content": chunk.content,
                }
            )

        return {"evidence": evidence}

    def analyze(state: InvestigationState) -> dict:
        attempts = state["attempts"] + 1

        if not state["evidence"]:
            return {
                "attempts": attempts,
                "answer": (
                    "Inssufficient evidence found in the source code to answer the question."
                ),
            }

        results = []

        for item in state["evidence"]:
            chunk = SourceChunk(
                chunk_id=item["chunk_id"],
                repository_id=state["repository_id"],
                file_path=item["file_path"],
                language="unknown",
                start_line=item["start_line"],
                end_line=item["end_line"],
                commit_sha=item["commit_sha"],
                content=item["content"],
                content_sha256="graph-evidence",
            )
            results.append(SearchResult(chunk=chunk, score=0.0))

        prompt = build_user_propmt(question=state["question"], results=results)

        if attempts > 0:
            valid_labels = ", ".join(
                f"[{item['source_id']}]" for item in state["evidence"]
            )

            prompt += (
                "\n\nYour previous response failed review.\n"
                f"Review feedback: {state['review_feedback']}\n"
                f"Allowed citation labels: {valid_labels}\n"
                "Return a concise final answer with valid"
                "citations. Do not include reasoning"
            )

        answer = analyst.generate(prompt=prompt)

        return {"attempts": attempts, "answer": answer}

    def reviewer(state: InvestigationState) -> dict:
        evidence = state["evidence"]
        answer = state["answer"].strip()

        if not evidence:
            return {
                "review_passed": False,
                "review_feedback": ("No source evidence was found.",),
            }
        vaild_labels = {item["source_id"] for item in evidence}

        cited_labels = {match.group(1) for match in re.finditer(r"\[(S\d+)\]", answer)}

        if not cited_labels:
            return {
                "review_passed": False,
                "review_feedback": (
                    "No valid source citations found. Expected [S1], [S2], etc."
                ),
            }

        unknown_labels = cited_labels - vaild_labels

        if unknown_labels:
            return {
                "review_passed": False,
                "review_feedback": (
                    "The answer cites unknown source labels: "
                    f"{sorted(unknown_labels)}"
                    f"Available labels: {sorted(vaild_labels)}"
                ),
            }

        return {
            "review_passed": True,
            "review_feedback": "Citation labels refer to retrieved evidence.",
        }

    graph = StateGraph(InvestigationState)

    graph.add_node("planner", planner)
    graph.add_node("retrieve", retrieve)
    graph.add_node("analyze", analyze)
    graph.add_node("reviewer", reviewer)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "retrieve")
    graph.add_edge("retrieve", "analyze")
    graph.add_edge("analyze", "reviewer")

    graph.add_conditional_edges(
        "reviewer", route_after_review, {"retry": "analyze", "end": END}
    )

    return graph.compile()
