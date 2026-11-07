from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.patches.generation import GeneratedPatch


class GeminiProvider:
    def __init__(
        self,
        model: str,
        api_key: str | None = None,
        client: Any | None = None,
    ):
        settings = get_settings()
        self.model = model
        if client is not None:
            self.client = client
            return

        key = settings.gemini_api_key if api_key is None else api_key
        if not key:
            raise ValueError("GEMINI_API_KEY is not configured")

        self.client = genai.Client(api_key=key)

    def generate(self, prompt: str) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0, max_output_tokens=2048),
        )

        if not response.text or not response.text.strip():
            raise ValueError("Gemini returned an empty response")

        return response.text.strip()

    def generate_structured(
        self,
        prompt: str,
        schema: type[GeneratedPatch],
    ) -> GeneratedPatch:

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=4096,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )

        if response.parsed is not None:
            return schema.model_validate(response.parsed)

        if not response.text:
            raise ValueError("Gemini returned empty structured output")

        return schema.model_validate_json(response.text)


class GeminiPatchProvider(GeminiProvider):
    def generate(self, prompt: str) -> str:
        result = self.generate_structured(
            prompt=prompt,
            schema=GeneratedPatch,
        )

        return result.model_dump_json()
