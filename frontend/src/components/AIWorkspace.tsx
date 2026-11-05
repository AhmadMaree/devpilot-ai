import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { get_investigation } from "../api/api";
import {
  getRepositoryIndexMetadata,
  getRepositoryIndexingStatus,
} from "../api/repositories";
import type {
  IndexingJob,
  InvestigationResponse,
  RepositoryIndexMetadata,
  SavedInvestigation,
} from "../api/types";
import type { KnownPatchProposal } from "../api/patches/types";
import { DevelopmentWorkflow } from "./DevelopmentWorkflow";

interface AIWorkspaceProps {
  repositoryId: string;
  repositoryName: string | null;
  restoredInvestigation: SavedInvestigation | null;
  onInvestigationComplete: (investigation: SavedInvestigation) => void;
  onOpenProposal: (proposalId: string) => void;
  onProposalCreated: (proposal: KnownPatchProposal) => void;
}

type WorkspaceMode = "ask" | "change";

function isIndexing(job: IndexingJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function AIWorkspace({
  repositoryId,
  repositoryName,
  restoredInvestigation,
  onInvestigationComplete,
  onOpenProposal,
  onProposalCreated,
}: AIWorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>("ask");
  const metadataQuery = useQuery<RepositoryIndexMetadata | null>({
    queryKey: ["repository-index-metadata", repositoryId],
    queryFn: ({ signal }) => getRepositoryIndexMetadata(repositoryId, signal),
    enabled: Boolean(repositoryId),
  });
  const statusQuery = useQuery<IndexingJob | null>({
    queryKey: ["repository-index-status", repositoryId],
    queryFn: ({ signal }) => getRepositoryIndexingStatus(repositoryId, signal),
    enabled: Boolean(repositoryId),
    refetchInterval: (query) => isIndexing(query.state.data) ? 2000 : false,
  });
  const metadata = metadataQuery.data;
  const job = statusQuery.data;

  let readinessMessage: string;
  let readinessKind: "ready" | "warning" | "error";
  if (!repositoryId) {
    readinessMessage = "Select a repository before using the AI Workspace.";
    readinessKind = "warning";
  } else if (metadataQuery.isPending) {
    readinessMessage = "Checking whether this repository has a usable index…";
    readinessKind = "warning";
  } else if (metadataQuery.isError) {
    readinessMessage = `Could not check repository index readiness: ${metadataQuery.error.message}`;
    readinessKind = "error";
  } else if (!metadata) {
    readinessMessage = job?.status === "failed"
      ? `No usable index is available. The latest indexing attempt failed: ${job.error_message || "No failure details were provided."} Retry indexing in Repositories.`
      : isIndexing(job)
        ? "Indexing is in progress. Ask Code will be available when a usable index is ready."
        : "No usable index is available. Index this repository in Repositories before asking questions about its code.";
    readinessKind = "warning";
  } else {
    readinessMessage = `A successful index from commit ${metadata.commit_sha.slice(0, 8)} is available.`;
    readinessKind = "ready";
    if (job?.status === "failed") {
      readinessMessage +=
        " The latest indexing attempt failed; Ask Code will use the previous successful index.";
    } else if (isIndexing(job)) {
      readinessMessage +=
        " Re-indexing is in progress; the previous successful index remains available.";
    } else if (statusQuery.isError) {
      readinessMessage +=
        " The latest indexing attempt status could not be checked.";
    }
  }

  const canAsk = Boolean(repositoryId && metadata && !metadataQuery.isError);

  return (
    <div className="ai-workspace">
      <section className="panel workspace-context" aria-labelledby="workspace-repository">
        <div>
          <p className="eyebrow">CURRENT REPOSITORY</p>
          <h2 id="workspace-repository">{repositoryName || "No repository selected"}</h2>
        </div>
        <p
          className={`workspace-readiness workspace-readiness-${readinessKind}`}
          role={readinessKind === "error" ? "alert" : "status"}
        >
          {readinessMessage}
          {(!repositoryId || !metadata) && (
            <>
              {" "}
              <a href="#repositories">Open Repositories</a>
            </>
          )}
          {metadataQuery.isError && (
            <button
              type="button"
              className="secondary-button workspace-retry"
              onClick={() => void metadataQuery.refetch()}
            >
              Retry
            </button>
          )}
        </p>
      </section>

      <div className="workspace-mode-switch" role="group" aria-label="AI Workspace mode">
        <button
          type="button"
          className={mode === "ask" ? "workspace-mode-active" : ""}
          aria-pressed={mode === "ask"}
          onClick={() => setMode("ask")}
        >
          Ask about code
        </button>
        <button
          type="button"
          className={mode === "change" ? "workspace-mode-active" : ""}
          aria-pressed={mode === "change"}
          onClick={() => setMode("change")}
        >
          Make a change
        </button>
      </div>

      <section className="workspace-mode-panel" hidden={mode !== "ask"}>
        <AskCode
          key={`${repositoryId}:${restoredInvestigation?.id ?? "new"}`}
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          canAsk={canAsk}
          restoredInvestigation={restoredInvestigation}
          onInvestigationComplete={onInvestigationComplete}
        />
      </section>

      <section className="workspace-mode-panel" hidden={mode !== "change"}>
        <DevelopmentWorkflow
          key={repositoryId}
          repositoryId={repositoryId}
          onOpenProposal={onOpenProposal}
          onProposalCreated={onProposalCreated}
        />
      </section>
    </div>
  );
}

interface AskCodeProps {
  repositoryId: string;
  repositoryName: string | null;
  canAsk: boolean;
  restoredInvestigation: SavedInvestigation | null;
  onInvestigationComplete: (investigation: SavedInvestigation) => void;
}

const defaultQuestion = "Where is repository ingestion implemented?";

function AskCode({
  repositoryId,
  repositoryName,
  canAsk,
  restoredInvestigation,
  onInvestigationComplete,
}: AskCodeProps) {
  const [question, setQuestion] = useState(
    restoredInvestigation?.result.question ?? defaultQuestion,
  );
  const [result, setResult] = useState<InvestigationResponse | null>(
    restoredInvestigation?.result ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();

    if (!repositoryId || !canAsk || trimmedQuestion.length < 3 || loading) {
      return;
    }

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const saved = await get_investigation(
        { repository_id: repositoryId, question: trimmedQuestion },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResult(saved.result);
        onInvestigationComplete(saved);
      }
    } catch (caughtError) {
      if (!controller.signal.aborted) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Investigation failed.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function cancelInvestigation() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }

  return (
    <div className="workspace-panel-content">
      <section className="panel">
        <h2>Ask about code</h2>
        <p className="muted">
          Ask a natural-language question about the selected repository.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="workspace-question" className="field-label">
            Your question
          </label>
          <textarea
            id="workspace-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Where is authentication handled?"
            rows={4}
            maxLength={2000}
            disabled={loading}
          />
          <div className="form-actions">
            <span className="helper-text">
              {repositoryName
                ? `Ask about ${repositoryName}.`
                : "Select a repository before asking a question."}
            </span>
            <div className="action-buttons">
              {loading && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={cancelInvestigation}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !canAsk || question.trim().length < 3}
              >
                {loading ? "Investigating…" : "Ask Code"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {loading && (
        <section className="panel" role="status">
          <div className="loading-row">
            <span className="spinner" />
            <div>
              <strong>Investigating your repository…</strong>
              <p className="muted">
                Retrieving code, generating an answer, and reviewing citations.
              </p>
            </div>
          </div>
        </section>
      )}

      {error && (
        <section className="error-panel" role="alert">
          <strong>Investigation failed</strong>
          <p>{error}</p>
        </section>
      )}

      {!loading && !error && !result && (
        <section className="panel workspace-empty-state">
          <strong>Ready to explore your code</strong>
          <p className="muted">
            Ask a question to see an answer with supporting files, line ranges,
            and agent execution details.
          </p>
        </section>
      )}

      {result && <InvestigationResult result={result} />}
    </div>
  );
}

function InvestigationResult({ result }: { result: InvestigationResponse }) {
  return (
    <>
      <section className="panel">
        <div className="result-header">
          <h2>Answer</h2>
          <span className={`review-badge ${result.review_passed ? "passed" : "failed"}`}>
            {result.review_passed ? "Review passed" : "Review failed"}
          </span>
        </div>
        {!result.review_passed && (
          <div className="review-warning" role="alert">
            This answer did not pass review. Do not treat it as verified.
          </div>
        )}
        <div className="answer-text">{result.answer}</div>
        <div className="result-meta">
          <span>Attempts: {result.attempts}</span>
          <span>Sources: {result.sources.length}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Source evidence</h2>
        {result.sources.length === 0 ? (
          <p className="muted">No supporting source evidence was retrieved.</p>
        ) : (
          <div className="sources-list">
            {result.sources.map((source) => (
              <div className="source-card" key={source.chunk_id}>
                <span className="source-label">[{source.source_id}]</span>
                <div className="source-details">
                  <strong>{source.file_path}</strong>
                  <small>Lines {source.start_line}–{source.end_line}</small>
                  <small>Commit {source.commit_sha.slice(0, 8)}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Agent execution</h2>
        <div className="execution-steps">
          <span>Planner</span><span aria-hidden="true">→</span>
          <span>Retriever</span><span aria-hidden="true">→</span>
          <span>Analyst</span><span aria-hidden="true">→</span>
          <span>Reviewer</span>
        </div>
        <div className="execution-details">
          <p><strong>Plan:</strong> {result.plan}</p>
          <p><strong>Review:</strong> {result.review_feedback}</p>
        </div>
      </section>
    </>
  );
}
