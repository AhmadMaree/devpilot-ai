import httpx

from .prompts import SYS_PROMPT


class OllamaChatProvider:
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "qwen3:4b",
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, prompt: str) -> str:

        response = httpx.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "stream": False,
                "think": False,
                "messages": [
                    {"role": "system", "content": SYS_PROMPT},
                    {"role": "user", "content": prompt},
                    
                ],
                "options": {
                    "temperature": 0,
                    "num_predict": 600,
                    "num_ctx": 4096,
                },
            },
            timeout=180.0,
        )

        response.raise_for_status()
        data = response.json()

        if data.get("done") is not True:
            raise ValueError(
                "Ollama did not complete the response"
            )

        done_reason = data.get("done_reason")

        if done_reason in {"length", "max_tokens"}:
            raise ValueError(
                "Ollama response reached the token limit"
            )
        
        if done_reason not in {None, "stop"}:
            raise ValueError(
                f"Unexpected Ollama completion reason: {done_reason}"
            )

        message = data.get("message")

        if not isinstance(message, dict):
            raise ValueError(
                "Ollama returned an invalid message"
            )
        
        content = data["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama returned an empty answer")

        return content.strip()
