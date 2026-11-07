import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getLLMModels,
  getLLMProviders,
  getLLMSelection,
  updateLLMSelection,
} from "../api/llm/api";
import { queryKeys } from "../api/queryKeys";
import type { LLMProvider, LLMSelection } from "../api/llm/types";

interface LLMModelSelectorProps {
  onSelectionChange?: (selection: LLMSelection) => void;
}

export function LLMModelSelector({
  onSelectionChange,
}: LLMModelSelectorProps) {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: queryKeys.llm.providers,
    queryFn: ({ signal }) => getLLMProviders(signal),
  });
  const selectionQuery = useQuery({
    queryKey: queryKeys.llm.selection,
    queryFn: ({ signal }) => getLLMSelection(signal),
  });
  const [providerOverride, setProviderOverride] = useState<LLMProvider | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const saved = selectionQuery.data ?? null;
  const provider = providerOverride ?? saved?.provider ?? "ollama";
  const modelsQuery = useQuery({
    queryKey: queryKeys.llm.models(provider),
    queryFn: ({ signal }) => getLLMModels(provider, signal),
    enabled: !selectionQuery.isPending && !selectionQuery.isError,
  });
  const saveMutation = useMutation({
    mutationFn: (selection: LLMSelection) => updateLLMSelection(selection),
    onSuccess: (selection) => {
      queryClient.setQueryData(queryKeys.llm.selection, selection);
      setMessage(`Saved ${selection.provider} / ${selection.model}`);
      onSelectionChange?.(selection);
    },
  });

  useEffect(() => {
    if (selectionQuery.data) onSelectionChange?.(selectionQuery.data);
  }, [onSelectionChange, selectionQuery.data]);

  const loading = providersQuery.isPending || selectionQuery.isPending;
  const loadingModels = modelsQuery.isPending;
  const error = providersQuery.error?.message
    ?? selectionQuery.error?.message
    ?? modelsQuery.error?.message
    ?? saveMutation.error?.message
    ?? "";
  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];
  const model = modelOverride ?? (
    saved?.provider === provider && models.some((item) => item.name === saved.model)
      ? saved.model
      : models[0]?.name ?? ""
  );
  const changed = saved?.provider !== provider || saved?.model !== model;

  if (loading) {
    return <p role="status">Loading AI model settings...</p>;
  }

  function saveSelection() {
    if (!model || saveMutation.isPending || loadingModels) return;
    setMessage("");
    saveMutation.mutate({ provider, model });
  }

  return (
    <section aria-label="AI model settings">
      <h2>AI Model Settings</h2>
      <p>One model is used for all DevPilot AI agents.</p>

      <div>
        <label htmlFor="llm-provider">Provider</label>
        <select
          id="llm-provider"
          value={provider}
          disabled={saveMutation.isPending}
          onChange={(event) => {
            setProviderOverride(event.target.value as LLMProvider);
            setModelOverride(null);
            setMessage("");
          }}
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.available}>
              {item.name}
              {!item.available ? " (Unavailable)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="llm-model">Model</label>
        <select
          id="llm-model"
          value={model}
          disabled={saveMutation.isPending || loadingModels}
          onChange={(event) => {
            setModelOverride(event.target.value);
            setMessage("");
          }}
        >
          <option value="" disabled>
            {loadingModels ? "Loading models..." : "Select model"}
          </option>
          {models.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        disabled={!changed || !model || saveMutation.isPending || loadingModels}
        onClick={saveSelection}
      >
        {saveMutation.isPending ? "Saving..." : "Save Model"}
      </button>

      {saved && (
        <p>Active model: {saved.provider} / {saved.model}</p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
