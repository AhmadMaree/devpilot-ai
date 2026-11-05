import { useCallback } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import type {
  KnownPatchProposal,
  PatchProposalDetails,
  PatchStatus,
} from "../api/patches/types";
import { getPatchProposalDetails } from "../api/patches/api";
import { PatchGenerator } from "./PatchGenerator";
import { PatchReview } from "./PatchReview";

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
  const activeProposals = proposals.filter(
    (proposal) => proposal.repository_id === repositoryId,
  );
  const proposalDetails = useQueries({
    queries: activeProposals.map((proposal) => ({
      queryKey: ["review-proposal-details", proposal.id],
      queryFn: () => getPatchProposalDetails(proposal.id),
    })),
  });
  const queryClient = useQueryClient();
  const selectedProposal = activeProposals.find(
    (proposal) => proposal.id === selectedProposalId,
  );
  const handleStatusChange = useCallback(
    (proposalId: string, status: PatchStatus) => {
      queryClient.setQueryData<PatchProposalDetails>(
        ["review-proposal-details", proposalId],
        (current) => current ? { ...current, status } : current,
      );
      onStatusChange(proposalId, status);
    },
    [onStatusChange, queryClient],
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
              Only proposals created or opened during this browser session are shown.
              DevPilot does not currently provide a proposal-list API.
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
        ) : activeProposals.length === 0 ? (
          <div className="review-empty-state">
            <strong>No known proposals for this repository</strong>
            <p>
              Make a change in AI Workspace or create a legacy direct patch below.
              Proposals from previous browser sessions are not listed automatically.
            </p>
            <a href="#ai-workspace">Open AI Workspace</a>
          </div>
        ) : (
          <div className="review-proposal-list">
            {activeProposals.map((proposal, index) => {
              const detailsQuery = proposalDetails[index];
              const currentStatus = detailsQuery?.data?.status ?? proposal.status;
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
                  {detailsQuery?.data?.explanation && (
                    <span>{detailsQuery.data.explanation}</span>
                  )}
                  <span>{proposal.request_context}</span>
                  <small>
                    {proposal.source === "workflow"
                      ? "Developer → Reviewer → QA workflow"
                      : "Legacy direct patch generator"}
                    {" · "}Added {new Date(proposal.known_at).toLocaleString()}
                  </small>
                </span>
                <span className={`proposal-status status-${currentStatus ?? "unknown"}`}>
                  {detailsQuery?.isPending
                    ? "Checking status…"
                    : detailsQuery?.isError
                      ? "Status unavailable"
                      : statusLabel(currentStatus ?? "pending")}
                </span>
              </button>
              );
            })}
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
