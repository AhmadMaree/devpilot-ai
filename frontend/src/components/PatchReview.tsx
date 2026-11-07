import { useEffect, useRef, useState } from "react";

import {
  approvePatch,
  getPatchPreview,
  getPatchProposalDetails,
  PatchApiError,
  rejectPatch,
} from "../api/patches/api";
import type {
  KnownPatchProposal,
  PatchActionResponse,
  PatchPreview,
  PatchProposalDetails,
  PatchStatus,
} from "../api/patches/types";
import { PatchDiffViewer } from "./PatchDiffViewer";

interface PatchReviewProps {
  proposal: KnownPatchProposal;
  onStatusChange: (proposalId: string, status: PatchStatus) => void;
}

export function PatchReview({ proposal, onStatusChange }: PatchReviewProps) {
  const [details, setDetails] = useState<PatchProposalDetails | null>(null);
  const [preview, setPreview] = useState<PatchPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const isPending = details?.status === "pending";
  const isHistorical = details?.status === "applied" || details?.status === "rejected";
  const staleFile = isPending
    && (error?.startsWith("File changed since proposal creation.") ?? false);
  const diff = preview?.diff;
  const hasDiff = typeof diff === "string" && diff.length > 0;

  useEffect(() => {
    let active = true;

    void getPatchProposalDetails(proposal.id)
      .then((currentDetails) => {
        if (!active) return;
        setDetails(currentDetails);
        onStatusChange(proposal.id, currentDetails.status);
        return getPatchPreview(proposal.id)
          .then((currentPreview) => {
            if (active) {
              setPreview(currentPreview);
              setError(null);
            }
          })
          .catch((caughtError: unknown) => {
            if (active && currentDetails.status === "pending") {
              setError(reviewErrorMessage(caughtError, "preview"));
            } else if (active && isTerminalStatus(currentDetails.status)) {
              setError("Could not load the saved historical diff. Retry to try again.");
            }
          });
      })
      .catch((caughtError: unknown) => {
        if (active) setError(reviewErrorMessage(caughtError, "details"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onStatusChange, proposal.id]);

  async function refreshProposalData(
    preserveError = false,
  ): Promise<PatchProposalDetails> {
    const latest = await getPatchProposalDetails(proposal.id);
    setDetails(latest);
    onStatusChange(proposal.id, latest.status);
    try {
      const latestPreview = await getPatchPreview(proposal.id);
      setPreview(latestPreview);
      if (!preserveError) setError(null);
    } catch (caughtError) {
      if (latest.status === "pending") {
        setError(reviewErrorMessage(caughtError, "preview"));
      } else if (isTerminalStatus(latest.status)) {
        setError("Could not load the saved historical diff. Retry to try again.");
      } else {
        setError(null);
      }
      throw caughtError;
    }
    return latest;
  }

  async function handleAction(action: "approve" | "reject") {
    if (
      actionLockRef.current
      || !details
      || details.status !== "pending"
      || (action === "approve" && !hasDiff)
    ) {
      return;
    }

    actionLockRef.current = true;
    if (action === "approve") {
      const confirmed = window.confirm(
        `Apply the proposed change to ${details.file_path}? This will modify the repository file.`,
      );
      if (!confirmed) {
        actionLockRef.current = false;
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      try {
        const result: PatchActionResponse = action === "approve"
          ? await approvePatch(proposal.id)
          : await rejectPatch(proposal.id);
        setMessage(result.message);
        onStatusChange(proposal.id, result.status);
      } catch (caughtError) {
        setError(reviewErrorMessage(caughtError, action));
        try {
          await refreshProposalData(true);
        } catch {
          // Keep the action error; the refreshed status or preview may be unavailable.
        }
        return;
      }

      try {
        await refreshProposalData();
      } catch (caughtError) {
        setError(
          `The action completed, but proposal history could not be refreshed: ${reviewErrorMessage(caughtError, "refresh")}`,
        );
      }
    } finally {
      actionLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="review-detail panel" aria-labelledby="patch-review-title">
      {loading ? (
        <p role="status">Loading proposal details…</p>
      ) : (
        <>
          <div className="review-detail-header">
            <div>
              <p className="eyebrow">PROPOSAL REVIEW</p>
              <h2 id="patch-review-title">
                {details?.file_path ?? proposal.file_path}
              </h2>
            </div>
            <span className={`proposal-status status-${details?.status ?? "unknown"}`}>
              {details ? statusLabel(details.status) : "Unavailable"}
            </span>
          </div>

          <div className="review-context-grid">
            <div>
              <span className="review-meta-label">Created from</span>
              <strong>{proposalSourceLabel(proposal.source)}</strong>
            </div>
            <div>
              <span className="review-meta-label">Created</span>
              <strong>{new Date(proposal.known_at).toLocaleString()}</strong>
            </div>
          </div>

          <div className="review-context">
            <h3>Change request</h3>
            <p>
              {proposal.source === "persisted"
                ? "The original request is not available in the proposal record."
                : proposal.request_context}
            </p>
            {details?.explanation && (
              <>
                <h3>Proposal explanation</h3>
                <p>{details.explanation}</p>
              </>
            )}
          </div>

          {proposal.workflow_feedback && (
            <section className="workflow-review-feedback" aria-labelledby="workflow-feedback-title">
              <h3 id="workflow-feedback-title">Workflow validation feedback</h3>
              <p className="muted">
                Reviewer and QA results are deterministic/static checks. They are
                not full AI code review, and project tests were not executed.
              </p>
              <div className="workflow-review-feedback-grid">
                <FeedbackItem label="Developer" value={proposal.workflow_feedback.developer} />
                <FeedbackItem
                  label="Code Reviewer — static validation"
                  value={proposal.workflow_feedback.reviewer}
                  passed={proposal.workflow_feedback.reviewer_passed}
                />
                <FeedbackItem
                  label="QA — static validation, no tests run"
                  value={proposal.workflow_feedback.qa}
                  passed={proposal.workflow_feedback.qa_passed}
                />
              </div>
            </section>
          )}

          {error && (isPending || !details) && (
            <p className="review-error" role="alert">{error}</p>
          )}
          {message && <p className="review-success" role="status">{message}</p>}

          {details?.status === "applied" ? (
            <section className="proposal-terminal-summary" aria-live="polite">
              <h3>Applied successfully</h3>
              <p>
                Patch applied to <strong>{details.file_path}</strong>. This is a
                read-only historical preview.
              </p>
            </section>
          ) : details?.status === "rejected" ? (
            <section className="proposal-terminal-summary" aria-live="polite">
              <h3>Proposal rejected</h3>
              <p>
                This proposal for <strong>{details.file_path}</strong> was rejected.
                No changes were applied.
              </p>
            </section>
          ) : null}

          {isHistorical ? (
            <section className="review-diff-section" aria-labelledby="review-diff-title">
              <div className="review-diff-heading">
                <div>
                  <h3 id="review-diff-title">Historical unified diff</h3>
                  <p className="muted">Saved when this proposal was created.</p>
                </div>
                {hasDiff && <span>{diff.split("\n").length} lines</span>}
              </div>
              {hasDiff ? (
                <PatchDiffViewer diff={diff} />
              ) : (
                <p className="review-preview-unavailable" role="status">
                  Historical diff unavailable — this proposal was created before diff history was enabled.
                </p>
              )}
            </section>
          ) : details?.status !== "applied" && details?.status !== "rejected" ? (
            <section className="review-diff-section" aria-labelledby="review-diff-title">
              <div className="review-diff-heading">
                <div>
                  <h3 id="review-diff-title">Unified diff</h3>
                  <p className="muted">Review every line before deciding.</p>
                </div>
                {hasDiff && <span>{diff.split("\n").length} lines</span>}
              </div>
              {hasDiff ? (
                <PatchDiffViewer diff={diff} />
              ) : staleFile ? (
                <div className="review-preview-unavailable" role="status">
                  <p>
                    This proposal is stale: the target file changed after it was
                    created. DevPilot blocks this diff and will not apply the
                    proposal because it could overwrite newer edits.
                  </p>
                  <p>
                    Generate a replacement proposal against the current file.
                    The stale proposal can still be rejected.
                  </p>
                  <a className="secondary-button" href="#ai-workspace">
                    Open AI Workspace to create a fresh proposal
                  </a>
                </div>
              ) : (
                <p className="review-preview-unavailable" role="status">
                  The diff is unavailable. Refresh or return to the workspace and generate a new proposal.
                </p>
              )}
            </section>
          ) : null}

          <div className="review-action-bar">
            <a className="secondary-button review-back-link" href="#ai-workspace">
              Back to AI Workspace
            </a>
            {isPending && (
              <div className="action-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={submitting || !details}
                  onClick={() => void handleRefresh()}
                >
                  Refresh status
                </button>
                <button
                  type="button"
                  className="secondary-button review-reject-button"
                  disabled={submitting || !details}
                  onClick={() => void handleAction("reject")}
                >
                  {submitting ? "Processing…" : "Reject"}
                </button>
                <button
                  type="button"
                  disabled={submitting || !canReview(details.status, preview)}
                  onClick={() => void handleAction("approve")}
                >
                  {submitting ? "Applying…" : "Approve and apply"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );

  async function handleRefresh() {
    setError(null);
    try {
      await refreshProposalData();
    } catch (caughtError) {
      setError(reviewErrorMessage(caughtError, "refresh"));
    }
  }
}

function proposalSourceLabel(source: KnownPatchProposal["source"]): string {
  switch (source) {
    case "workflow":
      return "Developer → Reviewer → QA workflow";
    case "direct":
      return "Legacy direct patch generator";
    case "persisted":
      return "Saved proposal";
  }
}

function FeedbackItem({
  label,
  value,
  passed,
}: {
  label: string;
  value: string;
  passed?: boolean;
}) {
  return (
    <div className="workflow-feedback-item">
      <strong>{label}</strong>
      {passed !== undefined && (
        <span className={passed ? "feedback-passed" : "feedback-attention"}>
          {passed ? "Passed" : "Needs attention"}
        </span>
      )}
      <p>{value || "No feedback was provided."}</p>
    </div>
  );
}

function canReview(status: PatchStatus, preview: PatchPreview | null): boolean {
  return status === "pending"
    && preview !== null
    && typeof preview.diff === "string"
    && preview.diff.length > 0;
}

function isTerminalStatus(status: PatchStatus): boolean {
  return status === "applied" || status === "rejected";
}

function statusLabel(status: PatchStatus): string {
  switch (status) {
    case "pending":
      return "Awaiting your review";
    case "applying":
      return "Applying";
    case "applied":
      return "Applied";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Could not apply";
  }
}

function reviewErrorMessage(error: unknown, operation: string): string {
  if (error instanceof PatchApiError) {
    if (error.status === 404) {
      return "This proposal no longer exists. It may have been removed from the local proposal store.";
    }
    if (error.status === 409) {
      return operation === "preview"
        ? "File changed since proposal creation. Generate a new proposal against the current file."
        : "The repository file changed or this proposal is no longer pending. Refresh its status; if the file changed, create a new proposal.";
    }
  }
  return error instanceof Error
    ? error.message
    : `Could not ${operation} the proposal.`;
}
