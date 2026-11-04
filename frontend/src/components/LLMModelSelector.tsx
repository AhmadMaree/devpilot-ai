
import { useEffect, useState } from "react";

import {
  getLLMModels,
  getLLMProviders,
  getLLMSelection,
  updateLLMSelection,
} from "../api/llm/api";

import type {
    LLMModelInfo,
    LLMProvider,
    LLMSelection,
    LLMProviderInfo
} from "../api/llm/types"

export function LLMModelSelector() {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [models, setModels] = useState<LLMModelInfo[]>([]);
  const [saved, setSaved] = useState<LLMSelection | null>(null);

  const [provider, setProvider] = useState<LLMProvider>("ollama");
  const [model, setModel] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [availableProviders, current] = await Promise.all([
          getLLMProviders(),
          getLLMSelection(),
        ]);

        if (!active) return;

        setProviders(availableProviders);
        setSaved(current);
        setProvider(current.provider);
        setModel(current.model);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load LLM settings",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    let active = true;

    async function loadModels() {
      setLoadingModels(true);
      setError("");
      setModels([]);

      try {
        const availableModels = await getLLMModels(provider);

        if (!active) return;

        setModels(availableModels);
        setModel((current) =>
          availableModels.some((item) => item.name === current)
            ? current
            : availableModels[0]?.name ?? "",
        );
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load models",
          );
          setModel("");
        }
      } finally {
        if (active) setLoadingModels(false);
      }
    }

    void loadModels();

    return () => {
      active = false;
    };
  }, [provider, loading]);

  async function saveSelection() {
    if (!model || saving || loadingModels) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await updateLLMSelection({
        provider,
        model,
      });

      setSaved(result);
      setMessage(`Saved ${result.provider} / ${result.model}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save model selection",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading AI model settings...</p>;
  }

  const changed =
    saved?.provider !== provider || saved?.model !== model;

  return (
    <section aria-label="AI model settings">
      <h2>AI Model Settings</h2>
      <p>One model is used for all DevPilot AI agents.</p>

      <div>
        <label htmlFor="llm-provider">Provider</label>
        <select
          id="llm-provider"
          value={provider}
          disabled={saving}
          onChange={(event) => {
            setProvider(event.target.value as LLMProvider);
            setModel("");
            setMessage("");
          }}
        >
          {providers.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={!item.available}
            >
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
          disabled={saving || loadingModels}
          onChange={(event) => {
            setModel(event.target.value);
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
        disabled={!changed || !model || saving || loadingModels}
        onClick={() => void saveSelection()}
      >
        {saving ? "Saving..." : "Save Model"}
      </button>

      {saved && (
        <p>
          Active model: {saved.provider} / {saved.model}
        </p>
      )}

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
