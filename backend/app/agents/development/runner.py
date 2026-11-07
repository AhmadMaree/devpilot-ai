from collections.abc import Callable
from pathlib import Path

from .graph import build_development_graph
from .state import DevelopmentState


def run_development_workflow(
    repository_id: str,
    repository_root: Path,
    file_path: str,
    instruction: str,
    generate_text: Callable[[str], str],
) -> DevelopmentState:
    initial_state: DevelopmentState = {
        "repository_id": repository_id,
        "file_path": file_path,
        "instruction": instruction,
        "proposal": None,
        "developer_status": "pending",
        "developer_feedback": "",
        "review_passed": False,
        "review_feedback": "",
        "qa_passed": False,
        "qa_feedback": "",
        "workflow_status": "running",
        "error": None,
    }

    graph = build_development_graph(
        repository_root=repository_root,
        generate_text=generate_text,
    )

    result = graph.invoke(initial_state)

    return result
