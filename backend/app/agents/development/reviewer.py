from pathlib import Path

from app.patches.preview import preview_patch

from .state import DevelopmentState


def build_reviewer_node(repository_root: Path):
    def reviewer(state: DevelopmentState) -> dict:
        proposal = state.get("proposal")

        if proposal is None:
            return {
                "review_passed": False,
                "review_feedback": "No patch proposal available.",
                "error": "No patch proposal available.",
            }

        if proposal.repository_id != state["repository_id"]:
            return {
                "review_passed": False,
                "review_feedback": "Repository ID mismatch.",
                "error": "Repository ID mismatch.",
            }

        if proposal.file_path != state["file_path"]:
            return {
                "review_passed": False,
                "review_feedback": "Target file mismatch.",
                "error": "Target file mismatch.",
            }

        try:
            diff = preview_patch(repository_root=repository_root, proposal=proposal)

            if not diff.strip():
                raise ValueError("Proposal contains no visible changes.")
            if not proposal.explanation.strip():
                raise ValueError("Proposal has no explanation.")

            return {
                "review_passed": True,
                "review_feedback": (
                    "Static review passed: repository identity, "
                    "target file, source hash, diff, and explanation "
                    "were validated. Semantic correctness has not "
                    "been verified."
                ),
                "error": None,
            }
        except (OSError, UnicodeError, ValueError) as exc:
            return {
                "review_passed": False,
                "review_feedback": str(exc),
                "error": str(exc),
            }

    return reviewer
