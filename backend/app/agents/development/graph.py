from pathlib import Path
from typing import Callable, Literal

from langgraph.graph import END, START, StateGraph

from .developer import build_developer_node
from .qa import build_qa_node
from .reviewer import build_reviewer_node
from .state import DevelopmentState


def mark_ready(state: DevelopmentState) -> dict:
    return {
        "workflow_status": "ready_for_approval",
        "error": None,
    }

def mark_failed(state: DevelopmentState) -> dict:
    return {
        "workflow_status": "failed",
        "error": (
            state.get("error")
            or state.get("qa_feedback")
            or state.get("review_feedback")
            or state.get("developer_feedback")
            or "Development workflow failed."
        ),
    }

def route_after_developer(
    state: DevelopmentState
)-> Literal["reviewer", "failed"]:

    if (
        state.get("developer_status") == "completed"
        and state.get("error") is None
        and state.get("proposal") is None
    ):
        return "reviewer"
    return "failed"

def route_after_reviewer(
    state: DevelopmentState,
) -> Literal["qa", "failed"]:
    if (
        state.get("review_passed") is True
        and state.get("error") is None
    ):
        return "qa"

    return "failed"

def route_after_qa(
    state: DevelopmentState,
) -> Literal["ready", "failed"]:
    if (
        state.get("qa_passed") is True
        and state.get("error") is None
    ):
        return "ready"

    return "failed"

def build_development_graph(
    repository_root: Path,
    generate_text: Callable[[str], str],
):
    """ Build a Developer -> Reviewer -> QA LangGraph."""

    builder = StateGraph(DevelopmentState)

    builder.add_node(
        "developer",
        build_developer_node(
            repository_root,
            generate_text
        )
    )

    builder.add_node(
        "reviewer",
        build_reviewer_node(repository_root),
    )

    builder.add_node(
        "qa",
        build_qa_node(),
    )

    builder.add_node("ready", mark_ready)
    builder.add_node("failed", mark_failed)

    builder.add_edge(START, "developer")
    builder.add_conditional_edges(
        "developer",
        route_after_developer,
        {
            "reviewer": "reviewer",
            "failed": "failed"
        }
    )

    builder.add_conditional_edges(
        "reviewer",
        route_after_reviewer,
        {
            "qa": "qa",
            "failed": "failed",
        },
    )

    builder.add_conditional_edges(
        "qa",
        route_after_qa,
        {
            "ready": "ready",
            "failed": "failed",
        },
    )

    builder.add_edge("ready", END)
    builder.add_edge("failed", END)

    return builder.compile()