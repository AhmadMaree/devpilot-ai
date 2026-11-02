import httpx
from .prompts import SYS_PROMPT, build_user_propmt


class OllamaChatProvider:
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "qwen3:4b",
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(
        self,
        prompt: str 
    ) -> str:

        response = httpx.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "stream": False,
                "think": False,
                "messages":[
                    {
                        "role": "system",
                        "content": SYS_PROMPT
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "options": {
                    "temperature": 0.1,
                    "num_predict": 600,
                    "num_ctx": 4096,
                }
            },
            timeout=180.0
        )

        response.raise_for_status()
        data = response.json()

        content = data["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama returned an empty answer")

        return content.strip()


        