import ast

from .state import DevelopmentState


MAX_REPLACEMENT_BYTES = 512 * 1024


def build_qa_node():

    def qa(state: DevelopmentState) -> dict:
        proposal = state.get("proposal")

        if proposal is None:
            return {
                "qa_passed": False,
                "qa_feedback": "No patch proposal available.",
                "error": "No patch proposal available.",
            }

        if not state.get("review_passed", False):
            return {
                "qa_passed": False,
                "qa_feedback": (
                    "Code review must pass before QA."
                ),
                "error": "Code review did not pass.",
            }

        if proposal.repository_id != state["repository_id"]:
            return {
                "qa_passed": False,
                "qa_feedback": "Repository ID mismatch.",
                "error": "Repository ID mismatch.",
            }


        if proposal.file_path != state["file_path"]:
            return {
                "qa_passed": False,
                "qa_feedback": "Target file mismatch.",
                "error": "Target file mismatch.",
            }

        content = proposal.replacement_content

        if not content.strip():
            return {
                "qa_passed": False,
                "qa_feedback": "Replacement content is empty.",
                "error": "Replacement content is empty.",
            }

        content_size = len(content.encode("utf-8"))

        if content_size > MAX_REPLACEMENT_BYTES:
            return {
                "qa_passed": False,
                "qa_feedback": (
                    "Replacement exceeds QA size limit."
                ),
                "error": "Replacement exceeds QA size limit.",
            }

        if proposal.file_path.lower().endswith(".py"):
            try:
                ast.parse(
                    content,
                    filename=proposal.file_path
                )
            except SyntaxError as exc:
                message = (
                    f"Python syntax error at line "
                    f"{exc.lineno}: {exc.msg}"
                )

                return {
                    "qa_passed": False,
                    "qa_feedback": message,
                    "error": message,
                }
        
        return {
                "qa_passed": True,
                "qa_feedback": (
                    "Static QA passed: Python syntax is valid, "
                    "content is nonempty, and size is acceptable. "
                    "No tests were executed."
                ),
                "error": None,
            }
    return qa