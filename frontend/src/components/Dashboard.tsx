import { useQuery } from "@tanstack/react-query";

import { getInvestigationHistory } from "../api/api";
import { queryKeys } from "../api/queryKeys";
import {
  getRepositories,
  getRepositoryIndexMetadata,
  getRepositoryIndexingStatus,
} from "../api/repositories";
import type {
  IndexingJob,
  InvestigationSummary,
  RepositoryIndexMetadata,
} from "../api/types";
import type { KnownPatchProposal } from "../api/patches/types";

interface DashboardProps {
  repositoryId: string;
  repositoryLoading?: boolean;
  proposals: KnownPatchProposal[];
  onOpenInvestigation: (investigationId: string) => void;
  onOpenProposal: (proposalId: string) => void;
}

function isIndexing(job: IndexingJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function Dashboard({
  repositoryId,
  repositoryLoading = false,
  proposals,
  onOpenInvestigation,
  onOpenProposal,
}: DashboardProps) {
  const repositoriesQuery = useQuery({
    queryKey: queryKeys.repositories.all,
    queryFn: ({ signal }) => getRepositories(signal),
  });
  const repository = repositoriesQuery.data?.find((item) => item.id === repositoryId);
  const metadataQuery = useQuery<RepositoryIndexMetadata | null>({
    queryKey: queryKeys.indexing.metadata(repositoryId),
    queryFn: ({ signal }) => getRepositoryIndexMetadata(repositoryId, signal),
    enabled: Boolean(repositoryId),
  });
  const statusQuery = useQuery<IndexingJob | null>({
    queryKey: queryKeys.indexing.status(repositoryId),
    queryFn: ({ signal }) => getRepositoryIndexingStatus(repositoryId, signal),
    enabled: Boolean(repositoryId),
    refetchInterval: (query) => isIndexing(query.state.data) ? 2000 : false,
  });
  const investigationsQuery = useQuery<InvestigationSummary[]>({
    queryKey: queryKeys.investigations.all,
    queryFn: ({ signal }) => getInvestigationHistory(signal),
  });

  const metadata = metadataQuery.data;
  const job = statusQuery.data;
  const pendingProposals = proposals.filter(
    (proposal) => proposal.repository_id === repositoryId
      && (proposal.status === "pending" || proposal.status === undefined),
  );
  let indexStatus: string;
  if (repositoryLoading) {
    indexStatus = "Loading active repository…";
  } else if (!repositoryId) {
    indexStatus = "No repository selected";
  } else if (metadataQuery.isPending) {
    indexStatus = "Checking index readiness…";
  } else if (metadataQuery.isError) {
    indexStatus = `Index status unavailable: ${metadataQuery.error.message}`;
  } else if (metadata) {
    indexStatus = job?.status === "failed"
      ? `A previous successful index is available; latest attempt failed: ${job.error_message || "No failure details were provided."}`
      : "A successful index is available";
  } else if (job?.status === "failed") {
    indexStatus = `Not indexed. Latest attempt failed: ${job.error_message || "No failure details were provided."}`;
  } else if (isIndexing(job)) {
    indexStatus = "Indexing in progress";
  } else {
    indexStatus = "Not indexed";
  }

  const nextActionHref = repositoryId && metadata ? "#ai-workspace" : "#repositories";
  const nextActionLabel = repositoryLoading
    ? "Loading…"
    : !repositoryId
      ? "Connect repository"
      : metadataQuery.isPending
        ? "Checking index…"
        : metadataQuery.isError
          ? "Check index status"
          : metadata
            ? "Ask Code"
            : isIndexing(job)
              ? "View indexing progress"
              : "Index repository";

  const recentInvestigations = (investigationsQuery.data ?? []).slice(0, 5);

  return (
    <div className="dashboard-experience">
      <section className="panel dashboard-panel" aria-labelledby="dashboard-welcome-title">
        <p className="eyebrow">YOUR CODE, YOUR WORKSPACE</p>
        <h2 id="dashboard-welcome-title">Welcome to DevPilot AI</h2>
        <p className="muted">
          Connect a repository, prepare its index, ask questions, and review
          every proposed code change before applying it.
        </p>
        <div className="onboarding-steps" aria-label="Getting started">
          <a href="#repositories" className="onboarding-step">
            <span className="step-number">1</span>
            <span><strong>Connect repository</strong><small>Register a local repository or import from GitHub</small></span>
          </a>
          <a href="#repositories" className="onboarding-step">
            <span className="step-number">2</span>
            <span><strong>Index code</strong><small>Prepare repository context for questions</small></span>
          </a>
          <a href="#ai-workspace" className="onboarding-step">
            <span className="step-number">3</span>
            <span><strong>Ask or request a change</strong><small>Review every proposed change before approval</small></span>
          </a>
        </div>
      </section>

      <section className="dashboard-summary-grid" aria-label="Workspace status">
        <article className="panel dashboard-status-card">
          <div className="dashboard-card-heading">
            <div>
              <p className="eyebrow">ACTIVE REPOSITORY</p>
              <h2>{repositoryLoading
                ? "Loading active repository…"
                : repository?.name ?? (repositoryId ? "Loading repository…" : "No repository selected")}</h2>
            </div>
            <span className={`dashboard-status-dot ${metadata ? "dashboard-status-ready" : ""}`} />
          </div>
          {repository && (
            <p className="dashboard-repository-location" title={repository.path}>
              {repository.path}
            </p>
          )}
          {repositoryId && !repositoriesQuery.isPending && !repository && (
            <p className="dashboard-inline-error" role="alert">
              The selected repository is not in the registered repository list.
            </p>
          )}
          {repositoriesQuery.isError && (
            <div className="dashboard-inline-error" role="alert">
              <p>Could not load repository details: {repositoriesQuery.error.message}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void repositoriesQuery.refetch()}
              >
                Retry
              </button>
            </div>
          )}
          <div
            className={`dashboard-index-status${job?.status === "failed" ? " dashboard-index-failed" : metadata ? " dashboard-index-ready" : ""}`}
            role={metadataQuery.isError ? "alert" : "status"}
          >
            <strong>Index readiness</strong>
            <span>{indexStatus}</span>
          </div>
          {metadata && (
            <p className="dashboard-index-commit">
              Last successful index: commit <code>{metadata.commit_sha.slice(0, 8)}</code>
              {" · "}{new Date(metadata.indexed_at).toLocaleString()}
            </p>
          )}
          {metadata && job?.status === "failed" && (
            <p className="dashboard-previous-index-note">
              The previous successful index remains available; the latest attempt
              did not replace it.
            </p>
          )}
          {metadataQuery.isError && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void metadataQuery.refetch()}
            >
              Retry index status
            </button>
          )}
          {statusQuery.isError && (
            <p className="dashboard-inline-error" role="alert">
              Latest indexing attempt status is unavailable: {statusQuery.error.message}
            </p>
          )}
          <div className="dashboard-card-actions">
            <a className="secondary-button" href="#repositories">
              {repositoryId ? "Manage repository" : "Connect repository"}
            </a>
            <a
              className="primary-link"
              href={nextActionHref}
              aria-disabled={repositoryLoading || (repositoryId !== "" && metadataQuery.isPending)}
            >
              {nextActionLabel}
            </a>
          </div>
        </article>

        <article className="panel dashboard-next-card">
          <p className="eyebrow">NEXT ACTION</p>
          {pendingProposals.length > 0 ? (
            <>
              <h2>Review a proposed change</h2>
              <p>
                {pendingProposals.length === 1
                  ? `${pendingProposals[0].file_path} is awaiting your review.`
                  : `${pendingProposals.length} known proposals are awaiting your review.`}
              </p>
              <button
                type="button"
                onClick={() => onOpenProposal(pendingProposals[0].id)}
              >
                Open Review Center
              </button>
            </>
          ) : repositoryLoading ? (
            <>
              <h2>Loading your workspace</h2>
              <p>Checking the registered repository selection.</p>
            </>
          ) : !repositoryId ? (
            <>
              <h2>Connect your first repository</h2>
              <p>Register a local Git repository or import a public GitHub repository.</p>
              <a className="primary-link" href="#repositories">Connect repository</a>
            </>
          ) : metadataQuery.isPending ? (
            <>
              <h2>Checking index readiness</h2>
              <p>Confirming whether this repository has a usable index.</p>
              <a className="primary-link" href="#repositories">Open Repositories</a>
            </>
          ) : metadataQuery.isError ? (
            <>
              <h2>Index readiness is unavailable</h2>
              <p>Check repository indexing status before asking questions.</p>
              <a className="primary-link" href="#repositories">Check index status</a>
            </>
          ) : !metadata && !metadataQuery.isPending ? (
            <>
              <h2>{isIndexing(job) ? "Repository indexing is in progress" : "Prepare the repository index"}</h2>
              <p>
                {isIndexing(job)
                  ? "Follow indexing progress and wait until a successful index is ready."
                  : "Indexing makes repository code available to Ask Code."}
              </p>
              <a className="primary-link" href="#repositories">
                {isIndexing(job) ? "View indexing progress" : "Index repository"}
              </a>
            </>
          ) : (
            <>
              <h2>Continue with your code</h2>
              <p>The repository has a successful index ready to use.</p>
              <div className="dashboard-card-actions">
                <a className="primary-link" href="#ai-workspace">Ask Code</a>
                <a className="secondary-button" href="#ai-workspace">Make Change</a>
              </div>
            </>
          )}
        </article>
      </section>

      <section className="panel dashboard-recent-panel" aria-labelledby="recent-investigations-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="recent-investigations-title">Recent investigations</h2>
            <p className="muted">Persisted investigation history from the backend.</p>
          </div>
          <a className="secondary-button" href="#activity">View Activity</a>
        </div>
        {investigationsQuery.isPending ? (
          <p role="status">Loading recent investigations…</p>
        ) : investigationsQuery.isError ? (
          <div className="dashboard-inline-error" role="alert">
            <p>Could not load investigations: {investigationsQuery.error.message}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void investigationsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : recentInvestigations.length === 0 ? (
          <p className="dashboard-empty-message">
            No saved investigations yet. Ask a question in AI Workspace to get started.
          </p>
        ) : (
          <div className="activity-list">
            {recentInvestigations.map((item) => (
              <InvestigationRow
                key={item.id}
                investigation={item}
                onOpen={() => onOpenInvestigation(item.id)}
              />
            ))}
          </div>
        )}
      </section>

      {proposals.length > 0 && (
        <section className="panel dashboard-proposals-panel" aria-labelledby="dashboard-proposals-title">
          <div className="dashboard-section-heading">
            <div>
              <h2 id="dashboard-proposals-title">Known proposals</h2>
              <p className="muted">Proposal references retained in this browser session.</p>
            </div>
            <a className="secondary-button" href="#review-center">Review Center</a>
          </div>
          <div className="dashboard-proposal-list">
            {proposals
              .filter((proposal) => proposal.repository_id === repositoryId)
              .slice(0, 4)
              .map((proposal) => (
                <button
                  className="dashboard-proposal-row"
                  type="button"
                  key={proposal.id}
                  onClick={() => onOpenProposal(proposal.id)}
                >
                  <span><strong>{proposal.file_path}</strong><small>{proposal.request_context}</small></span>
                  <span>{proposal.status ? proposalStatusLabel(proposal.status) : "Status unknown"}</span>
                </button>
              ))}
            {proposals.every((proposal) => proposal.repository_id !== repositoryId) && (
              <p className="dashboard-empty-message">
                No proposals are known for the active repository in this session.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function InvestigationRow({
  investigation,
  onOpen,
}: {
  investigation: InvestigationSummary;
  onOpen: () => void;
}) {
  return (
    <button className="activity-item" type="button" onClick={onOpen}>
      <span>
        <strong>{investigation.question}</strong>
        <small>{new Date(investigation.created_at).toLocaleString()}</small>
      </span>
      <span className={`review-badge ${investigation.review_passed ? "passed" : "failed"}`}>
        {investigation.review_passed ? "Reviewed" : "Needs review"}
      </span>
    </button>
  );
}

function proposalStatusLabel(status: string): string {
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
    default:
      return "Status unknown";
  }
}
