from typing import Protocol, runtime_checkable, Any

@runtime_checkable
class TextLLM(Protocol):
    def generate(self, prompt: str) -> str:
        ...


@runtime_checkable
class StructuredLLM(Protocol):
    def generate_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
    ) -> dict[str, Any]:
        ...
