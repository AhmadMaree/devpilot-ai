
from typing import TypedDict
from langgraph.graph import START, END, StateGraph 

class InvestigationState(TypedDict):
    question: str
    repository_id: str
    plan: str
    evidence: list[str]
    answer: str
    review_passed: bool


def planner(state: InvestigationState) -> dict:

    question = state["question"].strip()

    return {
        "plan": (
            f"Investigate repository source code for: {question}. "
        )
    } 

def retriever(state: InvestigationState) -> dict:

    return {
        "evidence": []
    }

def analyst(state: InvestigationState) -> dict:
    if not state["evidence"]:
        return {
            "answer": (
               "Inssufficient evidence found in the source code to answer the question."
            )
        }
    return {
        "answer": "Analysis pending implementation."
    }

def reviewer(state: InvestigationState) -> dict:

    return {
        "review_passed": bool(state["evidence"])
        and bool(state["answer"].strip()) and state["answer"].strip() != "Analysis pending implementation."
    }


def build_investigation_graph():
    graph = StateGraph(InvestigationState)

    graph.add_node("planner", planner)
    graph.add_node("retriever", retriever)
    graph.add_node("analyst", analyst)
    graph.add_node("reviewer", reviewer)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "retriever")
    graph.add_edge("retriever", "analyst")
    graph.add_edge("analyst", "reviewer")
    graph.add_edge("reviewer", END)

    return graph.compile()