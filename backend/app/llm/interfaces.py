from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class TextLLM(Protocol):
    def generate(self, prompt: str) -> str: ...


@runtime_checkable
class StructuredLLM(Protocol):
    def generate_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
    ) -> dict[str, Any]: ...
