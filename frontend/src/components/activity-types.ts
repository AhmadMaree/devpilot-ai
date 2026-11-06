import type { InvestigationSummary } from "../api/types";
import type { PatchProposalSummary, PatchStatus } from "../api/patches/types";
import type { DevelopmentWorkflowSummary } from "../api/workflow/types";

export type ActivityType = "investigation" | "workflow" | "proposal";

interface ActivityBase {
  id: string;
  repositoryId: string;
  createdAt: string;
  status: string;
}

export interface InvestigationActivity extends ActivityBase {
  type: "investigation";
  question: string;
  reviewPassed: boolean;
}

export interface WorkflowActivity extends ActivityBase {
  type: "workflow";
  filePath: string;
  instruction: string;
  proposalId: string | null;
}

export interface ProposalActivity extends ActivityBase {
  type: "proposal";
  filePath: string;
  explanation: string;
}

export type ActivityItem =
  | InvestigationActivity
  | WorkflowActivity
  | ProposalActivity;

export function normalizeInvestigations(
  investigations: InvestigationSummary[],
): InvestigationActivity[] {
  return investigations.map((investigation) => ({
    type: "investigation",
    id: investigation.id,
    repositoryId: investigation.repository_id,
    createdAt: investigation.created_at,
    status: investigation.review_passed ? "Reviewed" : "Needs review",
    question: investigation.question,
    reviewPassed: investigation.review_passed,
  }));
}

export function normalizeWorkflows(
  workflows: DevelopmentWorkflowSummary[],
  proposals: PatchProposalSummary[] = [],
): WorkflowActivity[] {
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  return workflows.map((workflow) => {
    const linkedProposal = workflow.proposal_id
      ? proposalsById.get(workflow.proposal_id)
      : undefined;
    return {
      type: "workflow",
      id: workflow.id,
      repositoryId: workflow.repository_id,
      createdAt: workflow.created_at,
      status: linkedProposal
        ? proposalStatusLabel(linkedProposal.status)
        : workflowStatusLabel(workflow.status),
      filePath: workflow.file_path,
      instruction: workflow.instruction,
      proposalId: workflow.proposal_id,
    };
  });
}

export function normalizeProposals(
  proposals: PatchProposalSummary[],
  workflows: WorkflowActivity[],
): ProposalActivity[] {
  const workflowProposalIds = new Set(
    workflows.flatMap((workflow) => workflow.proposalId ? [workflow.proposalId] : []),
  );
  return proposals
    .filter((proposal) => !workflowProposalIds.has(proposal.id))
    .map((proposal) => ({
      type: "proposal",
      id: proposal.id,
      repositoryId: proposal.repository_id,
      createdAt: proposal.created_at,
      status: proposalStatusLabel(proposal.status),
      filePath: proposal.file_path,
      explanation: proposal.explanation,
    }));
}

export function isPendingReview(item: ActivityItem): boolean {
  if (item.type === "proposal") return item.status === "Pending Review";
  return item.type === "workflow" && item.status === "Pending Review";
}

export function workflowStatusLabel(status: string): string {
  switch (status) {
    case "ready_for_approval":
      return "Pending Review";
    case "failed":
      return "Failed";
    case "review_rejected":
      return "Rejected";
    default:
      return readableStatus(status);
  }
}

function proposalStatusLabel(status: PatchStatus): string {
  switch (status) {
    case "pending":
      return "Pending Review";
    case "applying":
      return "Applying";
    case "applied":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
  }
}

function readableStatus(status: string): string {
  return status
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
