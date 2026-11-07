import httpx

from app.core import get_settings
from app.patches.generation import GeneratedPatch


class OllamaPatchProvider:
    def __init__(
        self,
        model: str = "qwen3:4b",
        base_url: str | None = None,
    ):
        self.model = model
        self.base_url = self.base_url = (
            base_url or get_settings().ollama_base_url
        ).rstrip("/")

    def generate(self, prompt: str) -> str:
        response = httpx.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "stream": False,
                "think": False,
                "format": GeneratedPatch.model_json_schema(),
                "options": {
                    "temperature": 0,
                    "num_predict": 2048,
                    "num_ctx": 4096,
                },
            },
            timeout=180,
        )

        response.raise_for_status()

        data = response.json()

        if data.get("done_reason") == "length":
            raise ValueError("Ollama truncated the generated patch")

        content = data.get("message", {}).get("content", "")

        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama returned an empty patch response")

        return content
