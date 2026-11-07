import { useCallback } from "react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  KnownPatchProposal,
  PatchProposalDetails,
  PatchProposalSummary,
  PatchStatus,
} from "../api/patches/types";
import { getPatchProposals } from "../api/patches/api";
import { queryKeys } from "../api/queryKeys";
import { PatchGenerator } from "./PatchGenerator";
import { PatchReview } from "./PatchReview";

const PROPOSAL_PAGE_SIZE = 50;

interface ReviewCenterProps {
  repositoryId: string;
  proposals: KnownPatchProposal[];
  selectedProposalId: string;
  onSelectProposal: (proposalId: string) => void;
  onProposalCreated: (proposal: KnownPatchProposal) => void;
  onStatusChange: (proposalId: string, status: PatchStatus) => void;
}

export function ReviewCenter({
  repositoryId,
  proposals,
  selectedProposalId,
  onSelectProposal,
  onProposalCreated,
  onStatusChange,
}: ReviewCenterProps) {
  const [pagination, setPagination] = useState({ repositoryId, page: 0 });
  const page = pagination.repositoryId === repositoryId ? pagination.page : 0;
  const [statusOverrides, setStatusOverrides] = useState<Record<string, PatchStatus>>({});
  const queryClient = useQueryClient();
  const proposalsQuery = useQuery({
    queryKey: queryKeys.proposals.page(repositoryId, page * PROPOSAL_PAGE_SIZE),
    queryFn: ({ signal }) =>
      getPatchProposals(repositoryId, page * PROPOSAL_PAGE_SIZE, signal),
    enabled: Boolean(repositoryId),
  });
  const persistedProposals = (proposalsQuery.data ?? []).map(toKnownProposal);
  const activeSessionProposals = proposals.filter(
    (proposal) => proposal.repository_id === repositoryId,
  );
  const proposalsById = new Map(
    persistedProposals.map((proposal) => [proposal.id, proposal]),
  );
  activeSessionProposals.forEach((proposal) => {
    const persistedProposal = proposalsById.get(proposal.id);
    proposalsById.set(proposal.id, {
      ...proposal,
      known_at: persistedProposal?.known_at ?? proposal.known_at,
      status: persistedProposal?.status ?? proposal.status,
    });
  });
  const activeProposals = [...proposalsById.values()];
  const activeProposalsRef = useRef(activeProposals);
  const statusOverridesRef = useRef(statusOverrides);
  const selectedProposal = activeProposals.find(
    (proposal) => proposal.id === selectedProposalId,
  );
  useEffect(() => {
    activeProposalsRef.current = activeProposals;
    statusOverridesRef.current = statusOverrides;
  });

  const handleStatusChange = useCallback(
    (proposalId: string, status: PatchStatus) => {
      const currentStatus = activeProposalsRef.current.find(
        (proposal) => proposal.id === proposalId,
      )?.status;
      const previousStatus = statusOverridesRef.current[proposalId] ?? currentStatus;
      if (previousStatus === status) return;
      setStatusOverrides((current) => ({ ...current, [proposalId]: status }));
      queryClient.setQueryData<PatchProposalDetails>(
        queryKeys.proposals.detail(proposalId),
        (current) => current ? { ...current, status } : current,
      );
      queryClient.setQueryData<PatchProposalSummary[]>(
        queryKeys.proposals.page(repositoryId, page * PROPOSAL_PAGE_SIZE),
        (current) => current?.map((proposal) =>
          proposal.id === proposalId ? { ...proposal, status } : proposal,
        ),
      );
      onStatusChange(proposalId, status);
    },
    [onStatusChange, page, queryClient, repositoryId],
  );

  return (
    <div className="review-center">
      <section className="panel review-center-intro">
        <div>
          <p className="eyebrow">HUMAN REVIEW REQUIRED</p>
          <h2>Review proposed changes</h2>
          <p className="muted">
            Inspect the diff and validation feedback before deciding whether
            to apply or reject a proposal.
          </p>
        </div>
        <a className="secondary-button review-back-link" href="#ai-workspace">
          Back to AI Workspace
        </a>
      </section>

      <section className="panel review-known-proposals" aria-labelledby="known-proposals-title">
        <div className="review-section-heading">
          <div>
            <h2 id="known-proposals-title">Known proposals</h2>
            <p className="muted">
              Proposals from the active repository, including saved work from earlier sessions.
            </p>
          </div>
          <span className="review-proposal-count">{activeProposals.length}</span>
        </div>

        {!repositoryId ? (
          <div className="review-empty-state">
            <strong>Select a repository</strong>
            <p>Choose an active repository before reviewing proposals.</p>
            <a href="#repositories">Open Repositories</a>
          </div>
        ) : proposalsQuery.isPending && activeProposals.length === 0 ? (
          <p role="status">Loading proposals…</p>
        ) : proposalsQuery.isError ? (
          <div className="review-empty-state" role="alert">
            <strong>Could not load proposals</strong>
            <p>Check that the backend is available, then retry.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void proposalsQuery.refetch()}
              disabled={proposalsQuery.isFetching}
            >
              Retry
            </button>
          </div>
        ) : activeProposals.length === 0 ? (
          <div className="review-empty-state">
            <strong>No proposals for this repository</strong>
            <p>
              Make a change in AI Workspace or create a legacy direct patch below.
            </p>
            <a href="#ai-workspace">Open AI Workspace</a>
          </div>
        ) : (
          <div className="review-proposal-list">
            {activeProposals.map((proposal) => {
              const currentStatus = statusOverrides[proposal.id] ?? proposal.status;
              return (
              <button
                type="button"
                key={proposal.id}
                className={`review-proposal-row${proposal.id === selectedProposalId ? " review-proposal-row-selected" : ""}`}
                aria-pressed={proposal.id === selectedProposalId}
                onClick={() => onSelectProposal(proposal.id)}
              >
                <span className="review-proposal-row-main">
                  <strong>{proposal.file_path}</strong>
                  <span>{proposal.request_context}</span>
                  <small>
                    {proposalSourceLabel(proposal.source)}
                    {" · "}{new Date(proposal.known_at).toLocaleString()}
                  </small>
                </span>
                <span className={`proposal-status status-${currentStatus ?? "unknown"}`}>
                  {currentStatus ? statusLabel(currentStatus) : "Status unavailable"}
                </span>
              </button>
              );
            })}
          </div>
        )}

        {repositoryId && !proposalsQuery.isPending && !proposalsQuery.isError && (
          <div className="activity-pagination" aria-label="Proposal pages">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPagination({
                repositoryId,
                page: Math.max(0, page - 1),
              })}
              disabled={page === 0 || proposalsQuery.isFetching}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPagination({
                repositoryId,
                page: page + 1,
              })}
              disabled={
                proposalsQuery.data.length < PROPOSAL_PAGE_SIZE ||
                proposalsQuery.isFetching
              }
            >
              Next
            </button>
          </div>
        )}
      </section>

      {selectedProposal && (
        <PatchReview
          key={selectedProposal.id}
          proposal={selectedProposal}
          onStatusChange={handleStatusChange}
        />
      )}

      <details className="panel legacy-patch-generator">
        <summary>Legacy direct patch generator</summary>
        <p className="muted">
          This backward-compatible path generates a proposal without the
          Developer → Reviewer → QA workflow. The proposal still requires your review.
        </p>
        {repositoryId ? (
          <PatchGenerator
            repositoryId={repositoryId}
            onGenerated={(generated, context) => {
              const proposal: KnownPatchProposal = {
                id: generated.id,
                repository_id: repositoryId,
                source: "direct",
                file_path: context.filePath,
                request_context: context.instruction,
                known_at: generated.created_at || new Date().toISOString(),
                status: generated.status,
              };
              onProposalCreated(proposal);
              onSelectProposal(proposal.id);
            }}
          />
        ) : (
          <p role="status">Select a repository before generating a proposal.</p>
        )}
      </details>
    </div>
  );
}

function statusLabel(status: PatchStatus): string {
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

function toKnownProposal(proposal: PatchProposalSummary): KnownPatchProposal {
  return {
    id: proposal.id,
    repository_id: proposal.repository_id,
    source: "persisted",
    file_path: proposal.file_path,
    request_context: proposal.explanation,
    known_at: proposal.created_at,
    status: proposal.status,
  };
}
