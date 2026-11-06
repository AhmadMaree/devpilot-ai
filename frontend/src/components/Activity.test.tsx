import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvestigationSummary, Repository } from "../api/types";
import { getPatchProposals } from "../api/patches/api";
import type { PatchProposalSummary } from "../api/patches/types";
import {
  getDevelopmentWorkflow,
  getDevelopmentWorkflows,
} from "../api/workflow/api";
import type {
  DevelopmentWorkflowDetail,
  DevelopmentWorkflowSummary,
} from "../api/workflow/types";
import { getInvestigationHistory } from "../api/api";
import { getRepositories } from "../api/repositories";
import { Activity } from "./Activity";

vi.mock("../api/api", () => ({
  getInvestigationHistory: vi.fn(),
}));

vi.mock("../api/repositories", () => ({
  getRepositories: vi.fn(),
}));

vi.mock("../api/workflow/api", () => ({
  getDevelopmentWorkflow: vi.fn(),
  getDevelopmentWorkflows: vi.fn(),
}));

vi.mock("../api/patches/api", () => ({
  getPatchProposals: vi.fn(),
}));

const activeRepository: Repository = {
  id: "repo-1",
  name: "Example Service",
  path: "D:\\work\\example-service",
  created_at: "2026-11-05T10:00:00Z",
};

const otherRepository: Repository = {
  ...activeRepository,
  id: "repo-2",
  name: "Other Repository",
};

const investigation: InvestigationSummary = {
  id: "investigation-1",
  repository_id: activeRepository.id,
  question: "Where is the API client configured?",
  review_passed: true,
  created_at: "2026-11-05T11:00:00Z",
};

const workflow: DevelopmentWorkflowSummary = {
  id: "workflow-1",
  repository_id: activeRepository.id,
  file_path: "src/client.ts",
  instruction: "Add retry handling.",
  status: "ready_for_approval",
  proposal_id: "proposal-linked",
  created_at: "2026-11-05T12:00:00Z",
};

const failedWorkflow: DevelopmentWorkflowSummary = {
  ...workflow,
  id: "workflow-failed",
  file_path: "src/failed.ts",
  instruction: "Update error handling.",
  status: "failed",
  proposal_id: null,
  created_at: "2026-11-05T13:30:00Z",
};

const workflowDetail: DevelopmentWorkflowDetail = {
  ...workflow,
  response: {
    workflow_status: "ready_for_approval",
    developer_status: "completed",
    developer_feedback: "Added retry handling.",
    review_passed: true,
    review_feedback: "Patch integrity checks passed.",
    qa_passed: true,
    qa_feedback: "Static validation passed.",
    error: null,
    proposal_id: "proposal-linked",
    diff: "+ retry();",
  },
};

const linkedProposal: PatchProposalSummary = {
  id: "proposal-linked",
  repository_id: activeRepository.id,
  file_path: workflow.file_path,
  explanation: "Linked change proposal",
  status: "rejected",
  created_at: "2026-11-05T12:05:00Z",
};

const pendingProposal: PatchProposalSummary = {
  id: "proposal-pending",
  repository_id: activeRepository.id,
  file_path: "src/pending.ts",
  explanation: "Standalone persisted patch proposal.",
  status: "pending",
  created_at: "2026-11-05T13:00:00Z",
};

function renderActivity(repositoryId = activeRepository.id) {
  const onOpenInvestigation = vi.fn();
  const onOpenProposal = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <Activity
        repositoryId={repositoryId}
        selectedInvestigationId={null}
        openError={null}
        onOpenInvestigation={onOpenInvestigation}
        onOpenProposal={onOpenProposal}
      />
    </QueryClientProvider>,
  );
  return { onOpenInvestigation, onOpenProposal };
}

describe("unified Activity dashboard", () => {
  beforeEach(() => {
    vi.mocked(getInvestigationHistory).mockReset();
    vi.mocked(getRepositories).mockReset();
    vi.mocked(getDevelopmentWorkflows).mockReset();
    vi.mocked(getDevelopmentWorkflow).mockReset();
    vi.mocked(getPatchProposals).mockReset();
    vi.mocked(getInvestigationHistory).mockResolvedValue([
      investigation,
      { ...investigation, id: "other-investigation", repository_id: otherRepository.id },
    ]);
    vi.mocked(getRepositories).mockResolvedValue([activeRepository, otherRepository]);
    vi.mocked(getDevelopmentWorkflows).mockResolvedValue([workflow, failedWorkflow]);
    vi.mocked(getDevelopmentWorkflow).mockResolvedValue(workflowDetail);
    vi.mocked(getPatchProposals).mockResolvedValue([linkedProposal, pendingProposal]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading skeletons for saved activity", () => {
    vi.mocked(getInvestigationHistory).mockImplementation(
      () => new Promise(() => undefined),
    );
    renderActivity();

    expect(screen.getByRole("status", { name: "Loading activity" })).toBeVisible();
    expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  });

  it("normalizes persisted sources, filters investigations to the active repository, and deduplicates linked proposals", async () => {
    renderActivity();

    await screen.findByText("src/failed.ts");
    expect(screen.getByText(/Showing activity for the active repository/)).toBeVisible();
    expect(screen.getAllByText("Example Service").length).toBeGreaterThan(0);
    const metrics = screen.getByRole("region", { name: "Activity summary" });
    expect(within(metrics).getByText("Investigations").nextElementSibling).toHaveTextContent("1");
    expect(within(metrics).getByText("Code Changes").nextElementSibling).toHaveTextContent("3");
    expect(within(metrics).getByText("Pending Reviews").nextElementSibling).toHaveTextContent("1");
    expect(screen.queryByText("Other Repository")).not.toBeInTheDocument();
    expect(screen.queryByText("Linked change proposal")).not.toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeVisible();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("src/failed.ts")).toBeVisible();
    expect(within(rows[1]).getByText("src/pending.ts")).toBeVisible();
    expect(within(rows[2]).getByText("src/client.ts")).toBeVisible();
    expect(within(rows[2]).getByText("Rejected")).toBeVisible();
    expect(within(rows[3]).getByText(investigation.question)).toBeVisible();
  });

  it("filters all activity categories through accessible filter tabs", async () => {
    renderActivity();
    await screen.findByText("src/pending.ts");

    fireEvent.click(screen.getByRole("button", { name: "Investigations" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(investigation.question)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Code Changes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reviews" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens existing investigation detail and workflow detail, and links to proposal review", async () => {
    const { onOpenInvestigation, onOpenProposal } = renderActivity();
    await screen.findByText(investigation.question);

    fireEvent.click(screen.getByRole("button", { name: /Investigation: Where is the API client configured/ }));
    expect(onOpenInvestigation).toHaveBeenCalledWith(investigation.id);

    fireEvent.click(screen.getByRole("button", { name: /Code change: src\/client.ts/ }));
    expect(await screen.findByText("Added retry handling.")).toBeVisible();
    expect(screen.getByText("Patch integrity checks passed.")).toBeVisible();
    expect(screen.getByText("Static validation passed.")).toBeVisible();
    fireEvent.click(screen.getByText("View proposed diff"));
    expect(screen.getByText("+ retry();")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open proposal in Review Center" }));
    expect(onOpenProposal).toHaveBeenCalledWith("proposal-linked");
  });

  it("paginates both persisted lists in bounded batches", async () => {
    vi.mocked(getDevelopmentWorkflows).mockImplementation(
      async (_repositoryId, offset) => offset === 0
        ? Array.from({ length: 50 }, (_, index) => ({
          ...failedWorkflow,
          id: `workflow-${index}`,
        }))
        : [],
    );
    vi.mocked(getPatchProposals).mockImplementation(
      async (_repositoryId, offset) => offset === 0
        ? Array.from({ length: 50 }, (_, index) => ({
          ...pendingProposal,
          id: `proposal-${index}`,
        }))
        : [],
    );
    renderActivity();
    await screen.findAllByText("src/failed.ts");

    fireEvent.click(screen.getByRole("button", { name: "Load more activity" }));
    await act(async () => {
      await waitFor(() => {
        expect(getDevelopmentWorkflows).toHaveBeenCalledWith(
          activeRepository.id,
          50,
          expect.any(AbortSignal),
        );
        expect(getPatchProposals).toHaveBeenCalledWith(
          activeRepository.id,
          50,
          expect.any(AbortSignal),
        );
      });
    });
  });

  it("shows generic errors and retries without displaying backend details", async () => {
    vi.mocked(getPatchProposals)
      .mockRejectedValueOnce(new Error("Traceback: secret provider state"))
      .mockResolvedValueOnce([pendingProposal]);
    renderActivity();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some activity could not be loaded",
    );
    expect(screen.queryByText(/secret provider state/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("src/pending.ts")).toBeVisible();
  });

  it("provides an empty state and repository guidance when no activity exists", async () => {
    vi.mocked(getInvestigationHistory).mockResolvedValue([]);
    vi.mocked(getDevelopmentWorkflows).mockResolvedValue([]);
    vi.mocked(getPatchProposals).mockResolvedValue([]);
    renderActivity();

    expect(await screen.findByText("No activity yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open AI Workspace" })).toHaveAttribute(
      "href",
      "#ai-workspace",
    );
  });
});
