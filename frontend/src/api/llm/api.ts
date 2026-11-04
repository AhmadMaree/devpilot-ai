import type {
    LLMSelection,
    LLMModelInfo,
    LLMProviderInfo,
    LLMProvider
} from './types'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const apiRequest = async <T> (
    path: string,
    init?: RequestInit,
):Promise<T> => {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (!response.ok) {
        let detail = `Request failed: ${response.status}`;

        try {
            const body: { detail?: string } = await response.json();
            if (typeof body.detail === "string") {
                detail = body.detail;
            }
        } catch {}

        throw new Error(detail);
    }

    return (await response.json()) as T;
}


export const getLLMProviders = (): Promise<LLMProviderInfo[]> => {
    return apiRequest("/api/v1/llm/providers");
}

export function getLLMModels(provider: LLMProvider = "ollama",): Promise<LLMModelInfo[]> {
  return apiRequest(`/api/v1/llm/models?provider=${encodeURIComponent(provider)}`);
}


export function getLLMSelection(): Promise<LLMSelection> {
  return apiRequest("/api/v1/llm/selection");
}



export function updateLLMSelection(
  selection: LLMSelection,
): Promise<LLMSelection> {
  return apiRequest("/api/v1/llm/selection", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(selection),
  });
}