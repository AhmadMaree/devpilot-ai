
import re
from typing import TypedDict, Protocol
from langgraph.graph import START, END, StateGraph

from app.retrieval.local_index import SearchResult 
from app.rag.prompts import build_user_propmt


class Retriever(Protocol):
    def search(
        self,
        question: str,
        repository_id: str,
        limit: int,
    ) -> list[SearchResult]:
        ...

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


def build_investigation_graph(
    retriever: Retriever,
    analyst: Analyst,
):

    def planner(state: InvestigationState) -> dict:

        question = state["question"].strip()

        return {
            "plan": (
                "Find source-code evidence explaining:"
                f"{question}"
            )
        }

    def retrieve(state: InvestigationState) -> dict:
        results = retriever.search(
            question=state["question"],
            repository_id=state["repository_id"],
            limit=5
        )

        evidence : list[Evidence] = []
        for index, result in enumerate(results, start=1):
            chunk = result.chunk
            evidence.append(
                {
                    "source_id": index,
                    "chunk_id": chunk.chunk_id,
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "commit_sha": chunk.commit_sha,
                    "content": chunk.content
                }
            )
        
        return {
            "evidence": evidence
        }

    def analyze(state: InvestigationState) -> dict:
        if not state["evidence"]:
            return {
                "answer": (
                "Inssufficient evidence found in the source code to answer the question."
                )
            }

        from app.chunking.models import SourceChunk
        from app.retrieval.local_index import SearchResult

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
                content_sha256="graph-evidence"
            )
            results.append(SearchResult(chunk=chunk, score=0.0))

        prompt = build_user_propmt(
            question=state["question"],
            results=results
        )

        answer = analyst.generate(prompt=prompt)

        return {
            "answer": answer
        }

    def reviewer(state: InvestigationState) -> dict:
        evidence = state["evidence"]
        answer = state["answer"].strip()

        if not evidence:
            return {
                "review_passed": False,
                "review_feedback": (
                    "No source evidence was found.",
                )
            }
        vaild_labels = {
            item["source_id"] for item in evidence
        }

        cited_labels = set(
            re.findall(r"\[S(\d+)\]", answer)
        )

        cited_labels = {
            f"S{number}" for number in cited_labels
        }

        if not cited_labels:
            return {
                "review_passed": False,
                "review_feedback": (
                    "Answer rejected: no valid source citations. "
                    "Use exact labels such as [S1] or [S2]. "
                    "Do not use [0], [1], or Evidence [0]."
                )
            }

        unknown_labels = cited_labels - vaild_labels

        if unknown_labels:
            return {
                "review_passed": False,
                "review_feedback": (
                    "The answer cites unknown source labels: "
                    f"{sorted(unknown_labels)}"
                ),
            }

        return {
            "review_passed": True,
            "review_feedback":  "Citation labels refer to retrieved evidence."
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
    graph.add_edge("reviewer", END)

    return graph.compile()