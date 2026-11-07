
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  generatePatchProposal,
} from "../api/patches/api";
import type {
  GeneratePatchRequest,
  GeneratedPatchResponse,
} from "../api/patches/types";
import styles from "./PatchGenerator.module.scss";

interface PatchGeneratorProps {
  repositoryId: string;
  onGenerated: (
    proposal: GeneratedPatchResponse,
    context: { filePath: string; instruction: string },
  ) => void;
}

export function PatchGenerator({
  repositoryId,
  onGenerated,
}: PatchGeneratorProps) {
  const [filePath, setFilePath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generateMutation = useMutation<
    GeneratedPatchResponse,
    Error,
    GeneratePatchRequest
  >({
    mutationFn: (payload) => generatePatchProposal(payload),
  });

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await generateMutation.mutateAsync({
        repository_id: repositoryId,
        file_path: filePath.trim(),
        instruction: instruction.trim(),
      });

      onGenerated(result, {
        filePath: filePath.trim(),
        instruction: instruction.trim(),
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate patch",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={styles.form}
    >
      <h2>Generate a code fix</h2>

      <label htmlFor="patch-file">
        Repository file
      </label>

      <input
        id="patch-file"
        value={filePath}
        onChange={(event) =>
          setFilePath(event.target.value)
        }
        placeholder="example.py"
        required
      />

      <label htmlFor="patch-instruction">
        What should DevPilot change?
      </label>

      <textarea
        id="patch-instruction"
        value={instruction}
        onChange={(event) =>
          setInstruction(event.target.value)
        }
        placeholder="Add input validation..."
        minLength={10}
        required
        rows={5}
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={loading || !repositoryId}>
        {loading
          ? "Generating proposal..."
          : "Generate patch proposal"}
      </button>
    </form>
  );
}
