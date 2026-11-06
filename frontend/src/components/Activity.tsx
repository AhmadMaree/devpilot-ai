import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { getInvestigationHistory } from "../api/api";
import { getRepositories } from "../api/repositories";
import { getPatchProposals } from "../api/patches/api";
import {
  getDevelopmentWorkflow,
  getDevelopmentWorkflows,
} from "../api/workflow/api";
import type {
  DevelopmentWorkflowDetail,
} from "../api/workflow/types";
import type { ActivityItem, ActivityType } from "./activity-types";
import {
  isPendingReview,
  normalizeInvestigations,
  normalizeProposals,
  normalizeWorkflows,
} from "./activity-types";

const PAGE_SIZE = 50;
const FILTERS: Array<{ id: "all" | ActivityType | "reviews"; label: string }> = [
  { id: "all", label: "All" },
  { id: "investigation", label: "Investigations" },
  { id: "workflow", label: "Code Changes" },
  { id: "reviews", label: "Reviews" },
];

interface ActivityProps {
  repositoryId: string;
  selectedInvestigationId: string | null;
  openError: string | null;
  onOpenInvestigation: (id: string) => void;
  onOpenProposal: (id: string) => void;
}

export function Activity({
  repositoryId,
  selectedInvestigationId,
  openError,
  onOpenInvestigation,
  onOpenProposal,
}: ActivityProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: ["investigation-history"],
    queryFn: ({ signal }) => getInvestigationHistory(signal),
  });
  const repositoriesQuery = useQuery({
    queryKey: ["repositories"],
    queryFn: ({ signal }) => getRepositories(signal),
  });
  const workflowsQuery = useInfiniteQuery({
    queryKey: ["development-workflows", repositoryId],
    queryFn: ({ pageParam, signal }) =>
      getDevelopmentWorkflows(repositoryId, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageOffset) =>
      lastPage.length === PAGE_SIZE ? lastPageOffset + PAGE_SIZE : undefined,
    enabled: Boolean(repositoryId),
  });
  const proposalsQuery = useInfiniteQuery({
    queryKey: ["patch-proposals", repositoryId],
    queryFn: ({ pageParam, signal }) =>
      getPatchProposals(repositoryId, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageOffset) =>
      lastPage.length === PAGE_SIZE ? lastPageOffset + PAGE_SIZE : undefined,
    enabled: Boolean(repositoryId),
  });
  const workflowDetailQuery = useQuery({
    queryKey: ["development-workflow", selectedWorkflowId],
    queryFn: ({ signal }) => getDevelopmentWorkflow(selectedWorkflowId!, signal),
    enabled: Boolean(selectedWorkflowId),
  });
  const repositoryName = (repositoriesQuery.data ?? [])
    .find((repository) => repository.id === repositoryId)?.name
    ?? null;
  const repositoryNames = new Map(
    (repositoriesQuery.data ?? []).map((repository) => [repository.id, repository.name]),
  );

  const activityItems = useMemo(() => {
    const rawProposals = proposalsQuery.data?.pages.flat() ?? [];
    const workflows = normalizeWorkflows(
      workflowsQuery.data?.pages.flat() ?? [],
      rawProposals,
    );
    const proposals = normalizeProposals(
      rawProposals,
      workflows,
    );
    const investigations = normalizeInvestigations(
      (historyQuery.data ?? []).filter(
        (investigation) => !repositoryId || investigation.repository_id === repositoryId,
      ),
    );
    return [...investigations, ...workflows, ...proposals]
      .sort((left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
  }, [
    historyQuery.data,
    proposalsQuery.data?.pages,
    repositoryId,
    workflowsQuery.data?.pages,
  ]);
  const filteredItems = activityItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "reviews") {
      return item.type === "proposal"
        || (item.type === "workflow" && item.proposalId !== null);
    }
    if (filter === "workflow") {
      return item.type === "workflow" || item.type === "proposal";
    }
    return item.type === filter;
  });
  const pendingReviewCount = activityItems.filter(isPendingReview).length;
  const codeChangeCount = activityItems.filter((item) => item.type !== "investigation").length;
  const isPending = historyQuery.isPending || (Boolean(repositoryId)
    && (workflowsQuery.isPending || proposalsQuery.isPending));
  const hasError = historyQuery.isError || (Boolean(repositoryId)
    && (workflowsQuery.isError || proposalsQuery.isError));
  const isFetching = historyQuery.isFetching
    || (Boolean(repositoryId) && (workflowsQuery.isFetching || proposalsQuery.isFetching));
  const hasNextPage = workflowsQuery.hasNextPage || proposalsQuery.hasNextPage;
  const isFetchingNextPage =
    workflowsQuery.isFetchingNextPage || proposalsQuery.isFetchingNextPage;

  async function refreshActivity() {
    await Promise.all([
      historyQuery.refetch(),
      ...(repositoryId
        ? [workflowsQuery.refetch(), proposalsQuery.refetch()]
        : []),
    ]);
  }

  async function loadMore() {
    await Promise.all([
      ...(workflowsQuery.hasNextPage ? [workflowsQuery.fetchNextPage()] : []),
      ...(proposalsQuery.hasNextPage ? [proposalsQuery.fetchNextPage()] : []),
    ]);
  }

  return (
    <div className="activity-dashboard">
      {openError && <p className="activity-error" role="alert">{openError}</p>}

      <header className="activity-dashboard-header">
        <div>
          <p className="muted">Activity for your selected repository</p>
          <p className="activity-repository-context" aria-live="polite">
            <span className="activity-repository-indicator" aria-hidden="true" />
            {repositoryId
              ? repositoryName ?? (repositoriesQuery.isPending
                ? "Loading repository…"
                : "Active repository")
              : "All repositories"}
            <span>·</span>
            {repositoryId
              ? "Showing activity for the active repository"
              : "No active repository selected"}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button activity-refresh"
          onClick={() => void refreshActivity()}
          disabled={isFetching}
        >
          <RefreshIcon />
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="activity-metrics" aria-label="Activity summary">
        <MetricCard
          label="Investigations"
          value={activityItems.filter((item) => item.type === "investigation").length}
          detail="Saved questions"
          icon="investigation"
        />
        <MetricCard
          label="Code Changes"
          value={codeChangeCount}
          detail="Workflows and proposals"
          icon="code"
        />
        <MetricCard
          label="Pending Reviews"
          value={pendingReviewCount}
          detail="Awaiting your decision"
          icon="review"
        />
      </section>

      <section className="activity-feed panel" aria-labelledby="recent-activity-title">
        <div className="activity-feed-heading">
          <div>
            <h2 id="recent-activity-title">Recent activity</h2>
            <p className="muted">
              {repositoryId
                ? "History is filtered to the active repository."
                : "Select a repository to load code changes and reviews."}
            </p>
          </div>
          <nav className="activity-filters" aria-label="Filter activity">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "activity-filter activity-filter-active" : "activity-filter"}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {isPending && activityItems.length === 0 ? (
          <ActivitySkeleton />
        ) : (
          <>
            {hasError && (
              <section className="activity-load-error" role="alert">
                <strong>Some activity could not be loaded</strong>
                <p>Retry to reload saved investigations, workflows, and proposals.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void refreshActivity()}
                  disabled={isFetching}
                >
                  Retry
                </button>
              </section>
            )}
            {filteredItems.length > 0 ? (
              <div className="activity-feed-list" role="list">
                {filteredItems.map((item) => (
                  <ActivityRow
                    key={`${item.type}:${item.id}`}
                    item={item}
                    repositoryName={repositoryNames.get(item.repositoryId) ?? "Unknown repository"}
                    selected={item.type === "investigation"
                      ? selectedInvestigationId === item.id
                      : item.type === "workflow" && selectedWorkflowId === item.id}
                    onOpenInvestigation={onOpenInvestigation}
                    onSelectWorkflow={setSelectedWorkflowId}
                    onOpenProposal={onOpenProposal}
                  />
                ))}
              </div>
            ) : !hasError ? (
              <ActivityEmptyState
                filter={filter}
                repositoryId={repositoryId}
              />
            ) : null}
          </>
        )}

        {!isPending && hasNextPage && (
          <div className="activity-load-more">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadMore()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Loading more…" : "Load more activity"}
            </button>
          </div>
        )}
      </section>

      {selectedWorkflowId && (
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          query={workflowDetailQuery}
          onClose={() => setSelectedWorkflowId(null)}
          onOpenProposal={onOpenProposal}
        />
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: "investigation" | "code" | "review";
}) {
  return (
    <article className="activity-metric-card">
      <span className={`activity-metric-icon activity-icon-${icon}`} aria-hidden="true">
        <ActivityIcon type={icon === "review" ? "proposal" : icon === "code" ? "workflow" : "investigation"} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ActivityRow({
  item,
  repositoryName,
  selected,
  onOpenInvestigation,
  onSelectWorkflow,
  onOpenProposal,
}: {
  item: ActivityItem;
  repositoryName: string;
  selected: boolean;
  onOpenInvestigation: (id: string) => void;
  onSelectWorkflow: (id: string) => void;
  onOpenProposal: (id: string) => void;
}) {
  const title = item.type === "investigation"
    ? item.question
    : item.filePath;
  const detail = item.type === "investigation"
    ? "Investigation"
    : item.type === "workflow"
      ? item.instruction
      : item.explanation;
  const handleOpen = () => {
    if (item.type === "investigation") onOpenInvestigation(item.id);
    else if (item.type === "workflow") onSelectWorkflow(item.id);
    else onOpenProposal(item.id);
  };

  return (
    <div className="activity-feed-row" role="listitem">
      <button
        type="button"
        className={`activity-row-button${selected ? " activity-row-selected" : ""}`}
        aria-label={`${activityTypeLabel(item.type)}: ${title}. Status: ${item.status}. Open details.`}
        onClick={handleOpen}
      >
        <span className={`activity-row-icon activity-icon-${item.type}`} aria-hidden="true">
          <ActivityIcon type={item.type} />
        </span>
        <span className="activity-row-content">
          <strong>{title}</strong>
          <span className="activity-row-meta">
            <span>{repositoryName}</span>
            <span aria-hidden="true">·</span>
            <span>{detail}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
          </span>
        </span>
        <span className={`activity-status ${statusClass(item.status)}`}>
          <span aria-hidden="true" />
          {item.status}
        </span>
        <span className="activity-row-chevron" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

function WorkflowDetail({
  workflowId,
  query,
  onClose,
  onOpenProposal,
}: {
  workflowId: string;
  query: UseQueryResult<DevelopmentWorkflowDetail, Error>;
  onClose: () => void;
  onOpenProposal: (id: string) => void;
}) {
  return (
    <section className="activity-detail-panel panel" aria-labelledby="activity-workflow-detail-title">
      <div className="activity-detail-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT WORKFLOW</p>
          <h2 id="activity-workflow-detail-title">Workflow details</h2>
        </div>
        <button
          type="button"
          className="activity-detail-close"
          aria-label="Close workflow details"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {query.isPending ? (
        <p role="status">Loading workflow details…</p>
      ) : query.isError ? (
        <div className="activity-load-error" role="alert">
          <p>Could not load workflow details.</p>
          <button type="button" className="secondary-button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <WorkflowFeedbackDetail
          key={workflowId}
          workflow={query.data}
          onOpenProposal={onOpenProposal}
        />
      )}
    </section>
  );
}

function WorkflowFeedbackDetail({
  workflow,
  onOpenProposal,
}: {
  workflow: DevelopmentWorkflowDetail;
  onOpenProposal: (id: string) => void;
}) {
  const { response } = workflow;
  const proposalId = workflow.proposal_id ?? response.proposal_id;
  return (
    <>
      <div className="activity-detail-summary">
        <span>{workflow.file_path}</span>
        <StatusBadge status={workflow.status} />
      </div>
      <p className="activity-detail-instruction">{workflow.instruction}</p>
      <div className="activity-feedback-grid">
        <FeedbackCard title="Developer" status={response.developer_status}>
          {response.developer_feedback}
        </FeedbackCard>
        <FeedbackCard title="Reviewer" passed={response.review_passed}>
          {response.review_feedback}
        </FeedbackCard>
        <FeedbackCard title="QA" passed={response.qa_passed}>
          {response.qa_feedback}
        </FeedbackCard>
      </div>
      {response.error && (
        <p className="activity-inline-warning" role="status">
          The workflow did not complete successfully. Stage feedback is shown above.
        </p>
      )}
      {response.diff && (
        <details className="activity-workflow-diff">
          <summary>View proposed diff</summary>
          <pre><code>{response.diff}</code></pre>
        </details>
      )}
      {proposalId && (
        <button
          type="button"
          className="primary-button activity-review-proposal"
          onClick={() => onOpenProposal(proposalId)}
        >
          Open proposal in Review Center
        </button>
      )}
    </>
  );
}

function FeedbackCard({
  title,
  status,
  passed,
  children,
}: {
  title: string;
  status?: string;
  passed?: boolean;
  children: string;
}) {
  return (
    <article className="activity-feedback-card">
      <div>
        <strong>{title}</strong>
        {status && <span className="activity-feedback-status">{status}</span>}
        {passed !== undefined && (
          <span className={passed ? "feedback-passed" : "feedback-attention"}>
            {passed ? "Passed" : "Needs attention"}
          </span>
        )}
      </div>
      <p>{children || "No feedback was provided."}</p>
    </article>
  );
}

function ActivityEmptyState({
  filter,
  repositoryId,
}: {
  filter: (typeof FILTERS)[number]["id"];
  repositoryId: string;
}) {
  const filteredLabel = filter === "all"
    ? "activity"
    : filter === "reviews"
      ? "reviews"
      : filter === "workflow"
        ? "code changes"
        : "investigations";
  return (
    <div className="activity-empty-state">
      <span className="activity-empty-icon" aria-hidden="true">⌁</span>
      <strong>No {filteredLabel} yet</strong>
      <p>
        {filter === "all"
          ? repositoryId
            ? "Your recent investigations and code changes will appear here."
            : "Select a repository to see its workflows and proposals."
          : `There are no ${filteredLabel} in this activity view.`}
      </p>
      {filter === "all" && repositoryId && (
        <a href="#ai-workspace">Open AI Workspace</a>
      )}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="activity-skeleton-list" aria-label="Loading activity" role="status">
      <span className="sr-only">Loading activity…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="activity-skeleton-row" key={index}>
          <span />
          <span>
            <i />
            <i />
          </span>
          <i />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`activity-status ${statusClass(status)}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
}

function ActivityIcon({ type }: { type: ActivityType }) {
  if (type === "investigation") {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="8.7" cy="8.7" r="5.6" />
        <path d="m13 13 4 4M6.5 8.7h4.4M8.7 6.5v4.4" />
      </svg>
    );
  }
  if (type === "workflow") {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 4.5h8l4 4v7H4zM12 4.5v4h4M7 12h6M7 14.5h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 10 3.2 3.2L15.5 6" />
      <circle cx="10" cy="10" r="8" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M14.7 7A6 6 0 0 0 4 4.7L2.8 6M2.8 6V2.8M2.8 6H6M3.3 11a6 6 0 0 0 10.7 2.3l1.2-1.3m0 0v3.2m0-3.2H12" />
    </svg>
  );
}

function activityTypeLabel(type: ActivityType): string {
  switch (type) {
    case "investigation":
      return "Investigation";
    case "workflow":
      return "Code change";
    case "proposal":
      return "Review";
  }
}

function statusClass(status: string): string {
  return `activity-status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}
