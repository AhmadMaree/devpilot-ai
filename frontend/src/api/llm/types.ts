export type LLMProvider = "ollama" | "openai" | "anthropic" | "gemini";

export interface LLMSelection {
  provider: LLMProvider;
  model: string;
}

export interface LLMProviderInfo {
  id: LLMProvider;
  name: string;
  available: boolean;
}

export interface LLMModelInfo {
  name: string;
  size: number | null;
}