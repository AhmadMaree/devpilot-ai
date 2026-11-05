
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { runDevelopmentWorkflow } from "../api/workflow/api";
import type { DevelopmentWorkflowResponse } from "../api/workflow/types";
import { PatchReview } from "./PatchReview";

interface DevelopmentWorkflowProps {
  repositoryId: string;
}

export function DevelopmentWorkflow({
  repositoryId,
}: DevelopmentWorkflowProps) {
  const [filePath, setFilePath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] =
    useState<DevelopmentWorkflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  // Prevent an old result from appearing under a newly
  // selected repository.
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, [repositoryId]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!repositoryId || !filePath.trim() || !instruction.trim()) {
      return;
    }

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await runDevelopmentWorkflow(
        {
          repository_id: repositoryId,
          file_path: filePath.trim(),
          instruction: instruction.trim(),
        },
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setResult(response);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Development workflow failed.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section className="panel development-workflow">
      <h2>AI Development Workflow</h2>

      <p>
        Generate a patch, review its integrity, and perform
        static QA before human approval.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="development-file-path">
          Target file
        </label>

        <input
          id="development-file-path"
          type="text"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
          placeholder="src/example.py"
          required
          disabled={loading}
        />

        <label htmlFor="development-instruction">
          Development task
        </label>

        <textarea
          id="development-instruction"
          value={instruction}
          onChange={(event) =>
            setInstruction(event.target.value)
          }
          placeholder="Add a docstring without changing behavior."
          minLength={10}
          maxLength={1000}
          rows={4}
          required
          disabled={loading}
        />

        <button
          type="submit"
          disabled={
            loading ||
            !repositoryId ||
            !filePath.trim() ||
            instruction.trim().length < 10
          }
        >
          {loading ? "Running workflow..." : "Run workflow"}
        </button>
      </form>

      {!repositoryId && (
        <p role="status">
          Select a registered repository first.
        </p>
      )}

      {error && (
        <p role="alert" className="development-error">
          {error}
        </p>
      )}

      {result && (
        <div className="development-results" aria-live="polite">
          <h3>Workflow result: {result.workflow_status}</h3>

          <div className="development-stage">
            <h4>1. Developer Agent</h4>
            <p>Status: {result.developer_status}</p>
            <p>{result.developer_feedback}</p>
          </div>

          <div className="development-stage">
            <h4>2. Code Reviewer</h4>
            <p>
              {result.review_passed
                ? "Static review passed"
                : "Static review did not pass"}
            </p>
            <p>{result.review_feedback}</p>
          </div>

          <div className="development-stage">
            <h4>3. QA Agent</h4>
            <p>
              {result.qa_passed
                ? "Static QA passed"
                : "Static QA did not pass or was skipped"}
            </p>
            <p>{result.qa_feedback}</p>
          </div>

          {result.error && (
            <p role="alert" className="development-error">
              {result.error}
            </p>
          )}

          {result.diff && (
            <div className="development-diff">
              <h4>Proposed changes</h4>
              <pre>
                <code>{result.diff}</code>
              </pre>
            </div>
          )}

          {result.workflow_status === "ready_for_approval" &&
            result.proposal_id && (
              <div className="development-approval">
                <h3>Human review required</h3>
                <p>
                  Static checks passed. Inspect the patch before
                  approving or rejecting it.
                </p>

                <PatchReview
                  key={result.proposal_id}
                  proposalId={result.proposal_id}
                />
              </div>
            )}
        </div>
      )}
    </section>
  );
}
