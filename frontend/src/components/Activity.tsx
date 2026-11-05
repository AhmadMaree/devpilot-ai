import { useQuery } from "@tanstack/react-query";

import { getInvestigationHistory } from "../api/api";
import { getRepositories } from "../api/repositories";
import type { KnownPatchProposal, PatchStatus } from "../api/patches/types";

interface ActivityProps {
  proposals: KnownPatchProposal[];
  selectedInvestigationId: string | null;
  openError: string | null;
  onOpenInvestigation: (id: string) => void;
  onOpenProposal: (id: string) => void;
}

export function Activity({
  proposals,
  selectedInvestigationId,
  openError,
  onOpenInvestigation,
  onOpenProposal,
}: ActivityProps) {
  const historyQuery = useQuery({
    queryKey: ["investigation-history"],
    queryFn: ({ signal }) => getInvestigationHistory(signal),
  });
  const repositoriesQuery = useQuery({
    queryKey: ["repositories"],
    queryFn: ({ signal }) => getRepositories(signal),
  });
  const repositoriesById = new Map(
    (repositoriesQuery.data ?? []).map((repository) => [repository.id, repository.name]),
  );
  const workflowProposals = proposals.filter((proposal) => proposal.source === "workflow");

  return (
    <div className="activity-experience">
      {openError && <p className="activity-error" role="alert">{openError}</p>}

      <section className="panel activity-persisted-panel" aria-labelledby="persisted-activity-title">
        <div className="activity-section-heading">
          <div>
            <p className="eyebrow">BACKEND HISTORY</p>
            <h2 id="persisted-activity-title">Saved investigations</h2>
            <p className="muted">
              Persisted investigation records available from the backend.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            {historyQuery.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {historyQuery.isPending ? (
          <p role="status">Loading saved investigations…</p>
        ) : historyQuery.isError ? (
          <div className="activity-error" role="alert">
            <p>Could not load investigation history: {historyQuery.error.message}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void historyQuery.refetch()}
              disabled={historyQuery.isFetching}
            >
              Retry
            </button>
          </div>
        ) : historyQuery.data.length === 0 ? (
          <div className="activity-empty-state">
            <strong>No saved investigations yet</strong>
            <p>Ask a question in AI Workspace to create a persisted investigation.</p>
            <a href="#ai-workspace">Open AI Workspace</a>
          </div>
        ) : (
          <div className="activity-list">
            {historyQuery.data.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  selectedInvestigationId === item.id
                    ? "activity-item activity-item-selected"
                    : "activity-item"
                }
                onClick={() => onOpenInvestigation(item.id)}
              >
                <span>
                  <strong>{item.question}</strong>
                  <small>
                    {repositoriesById.get(item.repository_id) ?? "Repository"}
                    {" · "}{new Date(item.created_at).toLocaleString()}
                  </small>
                </span>
                <span className={`review-badge ${item.review_passed ? "passed" : "failed"}`}>
                  {item.review_passed ? "Reviewed" : "Needs review"}
                </span>
              </button>
            ))}
          </div>
        )}
        {repositoriesQuery.isError && (
          <p className="activity-inline-warning" role="status">
            Repository names are unavailable: {repositoriesQuery.error.message}
          </p>
        )}
      </section>

      <section className="panel activity-session-panel" aria-labelledby="session-activity-title">
        <div className="activity-section-heading">
          <div>
            <p className="eyebrow">CURRENT BROWSER SESSION</p>
            <h2 id="session-activity-title">Known workflow proposals</h2>
            <p className="muted">
              Session-only proposal references retained after successful development
              workflows. Failed runs and proposals from earlier sessions are not available here.
            </p>
          </div>
          <a className="secondary-button" href="#review-center">Review Center</a>
        </div>

        {workflowProposals.length === 0 ? (
          <div className="activity-empty-state">
            <strong>No workflow proposals retained in this session</strong>
            <p>Completed workflow proposals will appear here while this page remains open.</p>
            <a href="#ai-workspace">Open AI Workspace</a>
          </div>
        ) : (
          <div className="activity-list">
            {workflowProposals.map((proposal) => (
              <button
                key={proposal.id}
                type="button"
                className="activity-item session-proposal-item"
                onClick={() => onOpenProposal(proposal.id)}
              >
                <span>
                  <strong>{proposal.file_path}</strong>
                  <small>
                    {proposal.request_context}
                    {" · "}Added {new Date(proposal.known_at).toLocaleString()}
                  </small>
                </span>
                <span className={`proposal-status status-${proposal.status ?? "unknown"}`}>
                  {proposal.status ? proposalStatusLabel(proposal.status) : "Status unknown"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function proposalStatusLabel(status: PatchStatus): string {
  switch (status) {
    case "pending":
      return "Awaiting review";
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
