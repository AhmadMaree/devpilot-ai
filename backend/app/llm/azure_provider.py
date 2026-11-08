from app.core import get_settings
from app.llm.azure_client import get_azure_openai_client
from app.rag.prompts import SYS_PROMPT
from app.patches.generation import GeneratedPatch

class AzureChatProvider:
    def __init__(
        self,
        model: str | None = None
    ):
        settings = get_settings()
        self.model = model or settings.azure_openai_chat_deployment
        self.client = get_azure_openai_client()

    def generate(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model= self.model,
            messages=[
                {"role": "system", "content": SYS_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=2048,
        )

        if not response.choices:
            raise ValueError("Azure OpenAI returned no choices")
        
        choice = response.choices[0]

        if choice.finish_reason == "length":
            raise ValueError("Azure OpenAI response was truncated")

        content = choice.message.content

        if not content or not content.strip():
            raise ValueError("Azure OpenAI returned an empty answer")

        return content.strip()

class AzurePatchProvider(AzureChatProvider):
    def generate(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a software engineering assistant. "
                        "Return a JSON object matching the supplied schema."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=4096,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "generated_patch",
                    "strict": True,
                    "schema": GeneratedPatch.model_json_schema()
                }
            }
        )

        if not response.choices:
            raise ValueError("Azure OpenAI returned no choices")

        choice = response.choices[0]

        if choice.finish_reason != "stop":
            raise ValueError(
                f"Azure patch generation stopped: {choice.finish_reason}"
            )

        content = choice.message.content 

        if not content:
            raise ValueError("Azure OpenAI returned an empty patch")

        return GeneratedPatch.model_validate_json(content).model_dump_json()
