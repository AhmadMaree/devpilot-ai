
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";

import { runDevelopmentWorkflow } from "../api/workflow/api";
import type { DevelopmentWorkflowResponse } from "../api/workflow/types";
import type { KnownPatchProposal } from "../api/patches/types";

interface DevelopmentWorkflowProps {
  repositoryId: string;
  onOpenProposal: (proposalId: string) => void;
  onProposalCreated: (proposal: KnownPatchProposal) => void;
  onWorkflowFinished?: () => void;
}

export function DevelopmentWorkflow({
  repositoryId,
  onOpenProposal,
  onProposalCreated,
  onWorkflowFinished,
}: DevelopmentWorkflowProps) {
  const [filePath, setFilePath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] =
    useState<DevelopmentWorkflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const workflowMutation = useMutation({
    mutationFn: ({
      request,
      signal,
    }: {
      request: {
        repository_id: string;
        file_path: string;
        instruction: string;
      };
      signal: AbortSignal;
    }) => runDevelopmentWorkflow(request, signal),
  });

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
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
      const response = await workflowMutation.mutateAsync({
        request: {
          repository_id: repositoryId,
          file_path: filePath.trim(),
          instruction: instruction.trim(),
        },
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setResult(response);
        if (response.proposal_id) {
          onProposalCreated({
            id: response.proposal_id,
            repository_id: repositoryId,
            source: "workflow",
            file_path: filePath.trim(),
            request_context: instruction.trim(),
            known_at: new Date().toISOString(),
            workflow_feedback: {
              developer: response.developer_feedback,
              reviewer: response.review_feedback,
              reviewer_passed: response.review_passed,
              qa: response.qa_feedback,
              qa_passed: response.qa_passed,
            },
            status: "pending",
          });
        }
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
      if (!controller.signal.aborted) {
        onWorkflowFinished?.();
      }
    }
  }

  return (
    <section className="panel development-workflow">
      <h2>Make a change</h2>

      <p>
        Describe a repository-relative change. DevPilot prepares a proposal for
        you to inspect in Review Center; it never applies changes automatically.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="development-file-path">
          Target file (relative to the repository)
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
          {loading ? "Preparing proposal…" : "Prepare change proposal"}
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
        <div className="development-results" aria-live="polite" aria-label="Make Change results">
          <h3>
            {result.workflow_status === "ready_for_approval"
              ? "Proposal ready for your review"
              : "A proposal could not be prepared"}
          </h3>

          <div className="development-stage">
            <h4>1. Developer</h4>
            <p>
              <strong>Status:</strong>{" "}
              {result.workflow_status === "ready_for_approval"
                ? "Draft prepared"
                : result.developer_status === "completed"
                  ? "Draft step completed"
                  : "Could not complete"}
            </p>
            <p>{result.developer_feedback}</p>
          </div>

          <div className="development-stage">
            <h4>2. Code Reviewer</h4>
            <p><strong>Status:</strong> {stageStatus(result.review_passed, result.review_feedback)}</p>
            <p>{result.review_feedback}</p>
          </div>

          <div className="development-stage">
            <h4>3. QA</h4>
            <p><strong>Status:</strong> {stageStatus(result.qa_passed, result.qa_feedback)}</p>
            <p>{result.qa_feedback}</p>
          </div>

          <p className="workflow-validation-note">
            Code Reviewer checks proposal integrity deterministically. QA performs
            static validation only; it does not run the project’s test suite. These
            stages are not full AI code review or executed tests.
          </p>

          {result.error && (
            <p role="alert" className="development-error">
              The workflow could not complete successfully. Review the stage feedback above or try again.
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

          {result.proposal_id && (
            <a
              className="primary-link"
              href="#review-center"
              onClick={() => {
                if (result.proposal_id) onOpenProposal(result.proposal_id);
              }}
            >
              Open proposal in Review Center
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function stageStatus(passed: boolean, feedback: string): string {
  if (passed) return "Static validation passed";
  return feedback.trim()
    ? "Static validation needs attention"
    : "Not reached";
}
