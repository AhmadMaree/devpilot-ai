import { apiClient } from "../client";
import type {
  LLMSelection,
  LLMModelInfo,
  LLMProviderInfo,
  LLMProvider,
} from "./types";

export async function getLLMProviders(
  signal?: AbortSignal,
): Promise<LLMProviderInfo[]> {
  const response = await apiClient.get<LLMProviderInfo[]>("/llm/providers", {
    signal,
    timeout: 60_000,
  });
  return response.data;
}

export async function getLLMModels(
  provider: LLMProvider = "ollama",
  signal?: AbortSignal,
): Promise<LLMModelInfo[]> {
  const response = await apiClient.get<LLMModelInfo[]>("/llm/models", {
    params: { provider },
    signal,
    timeout: 60_000,
  });
  return response.data;
}

export async function getLLMSelection(
  signal?: AbortSignal,
): Promise<LLMSelection> {
  const response = await apiClient.get<LLMSelection>("/llm/selection", {
    signal,
  });
  return response.data;
}

export async function updateLLMSelection(
  selection: LLMSelection,
  signal?: AbortSignal,
): Promise<LLMSelection> {
  const response = await apiClient.put<LLMSelection>(
    "/llm/selection",
    selection,
    { signal },
  );
  return response.data;
}
