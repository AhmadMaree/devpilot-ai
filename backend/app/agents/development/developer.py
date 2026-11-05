from collections.abc import Callable
from pathlib import Path

from app.patches.generation import (
    GeneratePatchRequest,
    generate_patch,
)

from .state import DevelopmentState


def build_developer_node(
    repository_root: Path,
    generate_text: Callable[[str], str],
):
    def developer(
        state: DevelopmentState,
    ) -> dict:
        try:
            request = GeneratePatchRequest(
                repository_id=state["repository_id"],
                file_path=state["file_path"],
                instruction=state["instruction"],
            )

            proposal = generate_patch(
                repository_root= repository_root,
                request=request,
                generate_text=generate_text,
            )

            return {
                "proposal": proposal,
                "developer_status": "completed",
                "developer_feedback": proposal.explanation,
                "error": None,
            }
        except (OSError, ValueError) as exc:
            return {
                "proposal": None,
                "developer_status": "failed",
                "developer_feedback": str(exc),
                "error": str(exc),

            }

    return developer