import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IndexingJob,
  RepositoryIndexMetadata,
  SavedInvestigation,
} from "../api/types";
import type { DevelopmentWorkflowResponse } from "../api/workflow/types";
import { AIWorkspace } from "./AIWorkspace";

const api = vi.hoisted(() => ({
  getInvestigation: vi.fn(),
  getIndexMetadata: vi.fn(),
  getIndexingStatus: vi.fn(),
  runWorkflow: vi.fn(),
}));

vi.mock("../api/api", () => ({
  get_investigation: api.getInvestigation,
}));

vi.mock("../api/repositories", () => ({
  getRepositoryIndexMetadata: api.getIndexMetadata,
  getRepositoryIndexingStatus: api.getIndexingStatus,
}));

vi.mock("../api/workflow/api", () => ({
  runDevelopmentWorkflow: api.runWorkflow,
}));

const repositoryId = "selected-repository-id";
const metadata: RepositoryIndexMetadata = {
  repository_id: repositoryId,
  commit_sha: "1234567890abcdef",
  indexed_at: "2026-11-05T10:00:00Z",
  index_version: "version-1",
};

const savedInvestigation: SavedInvestigation = {
  id: "investigation-1",
  created_at: "2026-11-05T10:01:00Z",
  result: {
    repository_id: repositoryId,
    question: "Where is authentication handled?",
    plan: "Search the authentication modules.",
    answer: "Authentication is handled in the auth service.",
    review_passed: true,
    review_feedback: "The answer is supported by cited code.",
    attempts: 2,
    sources: [{
      source_id: "S1",
      chunk_id: "chunk-1",
      file_path: "src/auth.ts",
      start_line: 12,
      end_line: 27,
      commit_sha: "1234567890abcdef",
    }],
  },
};

const successfulWorkflow: DevelopmentWorkflowResponse = {
  workflow_status: "ready_for_approval",
  developer_status: "completed",
  developer_feedback: "Prepared a focused change.",
  review_passed: true,
  review_feedback: "Patch integrity checks passed.",
  qa_passed: true,
  qa_feedback: "Static validation passed.",
  error: null,
  proposal_id: "proposal-123",
  diff: "+ updated line",
};

const failedWorkflow: DevelopmentWorkflowResponse = {
  workflow_status: "failed",
  developer_status: "failed",
  developer_feedback: "Could not prepare a change.",
  review_passed: false,
  review_feedback: "",
  qa_passed: false,
  qa_feedback: "",
  error: "The developer could not produce a valid proposal.",
  proposal_id: null,
  diff: null,
};

function makeJob(status: IndexingJob["status"]): IndexingJob {
  return {
    job_id: "job-1",
    repository_id: repositoryId,
    status,
    phase: status,
    processed_chunks: 0,
    total_chunks: 0,
    created_at: "2026-11-05T10:00:00Z",
    started_at: null,
    completed_at: status === "failed" ? "2026-11-05T10:01:00Z" : null,
    error_message: status === "failed" ? "Uncommitted changes are present." : null,
  };
}

function renderWorkspace(options?: {
  id?: string;
  restoredInvestigation?: SavedInvestigation | null;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onInvestigationComplete = vi.fn();
  const onOpenProposal = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AIWorkspace
        repositoryId={options?.id ?? repositoryId}
        repositoryName={options?.id === "" ? null : "Selected Repository"}
        restoredInvestigation={options?.restoredInvestigation ?? null}
        onInvestigationComplete={onInvestigationComplete}
        onOpenProposal={onOpenProposal}
        onProposalCreated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onInvestigationComplete, onOpenProposal, queryClient };
}

function fillWorkflowForm() {
  fireEvent.change(screen.getByLabelText("Target file (relative to the repository)"), {
    target: { value: "src/auth.ts" },
  });
  fireEvent.change(screen.getByLabelText("Development task"), {
    target: { value: "Add a clear authentication error message." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare change proposal" }));
}

describe("unified AI Workspace", () => {
  beforeEach(() => {
    api.getInvestigation.mockResolvedValue(savedInvestigation);
    api.getIndexMetadata.mockResolvedValue(metadata);
    api.getIndexingStatus.mockResolvedValue(null);
    api.runWorkflow.mockResolvedValue(successfulWorkflow);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a successful Ask Code response and cited source files", async () => {
    const { onInvestigationComplete } = renderWorkspace();
    await screen.findByText(/A successful index from commit/);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "Where is authentication handled?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Code" }));

    expect(await screen.findByText("Authentication is handled in the auth service."))
      .toBeVisible();
    expect(screen.getByText("src/auth.ts")).toBeVisible();
    expect(screen.getByText("Lines 12–27")).toBeVisible();
    expect(document.querySelector(".citation-feedback")).toHaveTextContent(
      "The answer is supported by cited code.",
    );
    expect(onInvestigationComplete).toHaveBeenCalledWith(savedInvestigation);
  });

  it("uses the same interactive result for an investigation opened from history", async () => {
    const historical = {
      ...savedInvestigation,
      result: {
        ...savedInvestigation.result,
        answer: "Authentication is handled in the auth service [S1].",
      },
    };
    renderWorkspace({ restoredInvestigation: historical });

    const citation = screen.getByRole("button", {
      name: "Go to source [S1], src/auth.ts",
    });
    expect(citation).toBeVisible();
    fireEvent.click(citation);
    expect(screen.getByRole("article", { name: "[S1] src/auth.ts" }))
      .toHaveClass("source-card-selected");
  });

  it("shows Ask Code loading and API failure states", async () => {
    let rejectRequest: (error: Error) => void = () => undefined;
    api.getInvestigation.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));
    renderWorkspace();
    await screen.findByText(/A successful index from commit/);
    fireEvent.click(screen.getByRole("button", { name: "Ask Code" }));

    expect(await screen.findByText("Investigating your repository…")).toBeVisible();
    await act(async () => rejectRequest(new Error("AI service is unavailable")));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI service is unavailable");
  });

  it("shows all stages and a proposed diff after a successful Make Change workflow", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fillWorkflowForm();

    expect(await screen.findByRole("heading", { name: "Proposal ready for your review" }))
      .toBeVisible();
    expect(screen.getByText("1. Developer")).toBeVisible();
    expect(screen.getByText("2. Code Reviewer")).toBeVisible();
    expect(screen.getByText("3. QA")).toBeVisible();
    expect(screen.getByText("+ updated line")).toBeVisible();
    expect(screen.getByText(/does not run the project’s test suite/)).toBeVisible();
  });

  it("shows readable stage failures when Make Change cannot prepare a proposal", async () => {
    api.runWorkflow.mockResolvedValue(failedWorkflow);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fillWorkflowForm();

    expect(await screen.findByRole("heading", { name: "A proposal could not be prepared" }))
      .toBeVisible();
    expect(screen.getByText("Could not complete")).toBeVisible();
    expect(screen.getAllByText("Not reached")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The developer could not produce a valid proposal.",
    );
    expect(screen.queryByRole("link", { name: "Open proposal in Review Center" }))
      .not.toBeInTheDocument();
  });

  it("sends the selected repository ID to both existing API requests", async () => {
    const { onInvestigationComplete } = renderWorkspace();
    await screen.findByText(/A successful index from commit/);
    fireEvent.click(screen.getByRole("button", { name: "Ask Code" }));
    await screen.findByText("Authentication is handled in the auth service.");
    expect(api.getInvestigation).toHaveBeenCalledWith(
      { repository_id: repositoryId, question: "Where is repository ingestion implemented?" },
      expect.any(AbortSignal),
    );
    expect(onInvestigationComplete).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fillWorkflowForm();
    await screen.findByRole("heading", { name: "Proposal ready for your review" });
    expect(api.runWorkflow).toHaveBeenCalledWith(
      {
        repository_id: repositoryId,
        file_path: "src/auth.ts",
        instruction: "Add a clear authentication error message.",
      },
      expect.any(AbortSignal),
    );
  });

  it("preserves typed Ask Code and Make Change inputs when switching modes", () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "How is login validated?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fireEvent.change(screen.getByLabelText("Target file (relative to the repository)"), {
      target: { value: "src/login.ts" },
    });
    fireEvent.change(screen.getByLabelText("Development task"), {
      target: { value: "Validate the login response safely." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Ask about code" }));
    expect(screen.getByLabelText("Your question")).toHaveValue("How is login validated?");
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    expect(screen.getByLabelText("Target file (relative to the repository)"))
      .toHaveValue("src/login.ts");
    expect(screen.getByLabelText("Development task"))
      .toHaveValue("Validate the login response safely.");
  });

  it("opens a generated proposal through the Review Center reference", async () => {
    const onOpenProposal = vi.fn(() => {
      window.location.hash = "#review-center";
    });
    render(
      <QueryClientProvider client={new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })}>
        <AIWorkspace
          repositoryId={repositoryId}
          repositoryName="Selected Repository"
          restoredInvestigation={null}
          onInvestigationComplete={vi.fn()}
          onOpenProposal={onOpenProposal}
          onProposalCreated={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fillWorkflowForm();
    const reviewLink = await screen.findByRole("link", {
      name: "Open proposal in Review Center",
    });
    expect(reviewLink).toHaveAttribute("href", "#review-center");
    fireEvent.click(reviewLink);
    expect(onOpenProposal).toHaveBeenCalledWith("proposal-123");
    expect(window.location.hash).toBe("#review-center");
  });

  it("asks the user to select a repository before either request can run", () => {
    renderWorkspace({ id: "" });
    expect(screen.getByText("Select a repository before using the AI Workspace."))
      .toBeVisible();
    expect(screen.getByRole("link", { name: "Open Repositories" })).toHaveAttribute(
      "href",
      "#repositories",
    );
    expect(screen.getByRole("button", { name: "Ask Code" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    expect(screen.getByRole("button", { name: "Prepare change proposal" })).toBeDisabled();
    expect(api.getInvestigation).not.toHaveBeenCalled();
    expect(api.runWorkflow).not.toHaveBeenCalled();
  });

  it("clearly reports an unusable index and does not allow Ask Code", async () => {
    api.getIndexMetadata.mockResolvedValue(null);
    api.getIndexingStatus.mockResolvedValue(makeJob("failed"));
    renderWorkspace();

    expect(await screen.findByText(/No usable index is available/)).toBeVisible();
    expect(screen.getByText(/latest indexing attempt failed: Uncommitted changes are present/))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Ask Code" })).toBeDisabled();
  });

  it("distinguishes the previous successful index from the latest failed attempt", async () => {
    api.getIndexingStatus.mockResolvedValue(makeJob("failed"));
    renderWorkspace();

    const readiness = await screen.findByText(/A successful index from commit/);
    expect(readiness).toHaveTextContent(
      "The latest indexing attempt failed; Ask Code will use the previous successful index.",
    );
    expect(readiness).toHaveTextContent("12345678");
  });

  it("does not expose automatic patch approval in the AI Workspace", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Make a change" }));
    fillWorkflowForm();
    await screen.findByRole("heading", { name: "Proposal ready for your review" });

    expect(screen.queryByRole("button", { name: "Approve patch" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open proposal in Review Center" })).toBeVisible();
  });
});
