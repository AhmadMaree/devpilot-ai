import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IndexingJob,
  InvestigationSummary,
  Repository,
  RepositoryIndexMetadata,
} from "../api/types";
import type { KnownPatchProposal } from "../api/patches/types";
import { Dashboard } from "./Dashboard";

const api = vi.hoisted(() => ({
  getRepositories: vi.fn(),
  getRepositoryIndexMetadata: vi.fn(),
  getRepositoryIndexingStatus: vi.fn(),
  getInvestigationHistory: vi.fn(),
}));

vi.mock("../api/repositories", () => ({
  getRepositories: api.getRepositories,
  getRepositoryIndexMetadata: api.getRepositoryIndexMetadata,
  getRepositoryIndexingStatus: api.getRepositoryIndexingStatus,
}));

vi.mock("../api/api", () => ({
  getInvestigationHistory: api.getInvestigationHistory,
}));

const repository: Repository = {
  id: "repo-1",
  name: "Example Service",
  path: "D:\\work\\example-service",
  created_at: "2026-11-05T10:00:00Z",
};

const metadata: RepositoryIndexMetadata = {
  repository_id: repository.id,
  commit_sha: "abcdef0123456789",
  indexed_at: "2026-11-05T10:30:00Z",
  index_version: "v1",
};

const investigation: InvestigationSummary = {
  id: "investigation-1",
  repository_id: repository.id,
  question: "Where is the API client configured?",
  review_passed: true,
  created_at: "2026-11-05T11:00:00Z",
};

const proposal: KnownPatchProposal = {
  id: "proposal-1",
  repository_id: repository.id,
  source: "workflow",
  file_path: "src/client.ts",
  request_context: "Add retry handling.",
  known_at: "2026-11-05T12:00:00Z",
  status: "pending",
};

function makeJob(status: IndexingJob["status"]): IndexingJob {
  return {
    job_id: "job-1",
    repository_id: repository.id,
    status,
    phase: status,
    processed_chunks: 4,
    total_chunks: 8,
    created_at: "2026-11-05T10:00:00Z",
    started_at: "2026-11-05T10:00:01Z",
    completed_at: status === "failed" ? "2026-11-05T10:02:00Z" : null,
    error_message: status === "failed" ? "Embedding service unavailable" : null,
  };
}

function renderDashboard(options?: {
  repositoryId?: string;
  repositories?: Repository[];
  metadata?: RepositoryIndexMetadata | null;
  job?: IndexingJob | null;
  investigations?: InvestigationSummary[];
  proposals?: KnownPatchProposal[];
}) {
  const onOpenInvestigation = vi.fn();
  const onOpenProposal = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <Dashboard
        repositoryId={options?.repositoryId ?? repository.id}
        proposals={options?.proposals ?? []}
        onOpenInvestigation={onOpenInvestigation}
        onOpenProposal={onOpenProposal}
      />
    </QueryClientProvider>,
  );
  return { onOpenInvestigation, onOpenProposal };
}

describe("smart dashboard", () => {
  beforeEach(() => {
    api.getRepositories.mockReset();
    api.getRepositoryIndexMetadata.mockReset();
    api.getRepositoryIndexingStatus.mockReset();
    api.getInvestigationHistory.mockReset();
    api.getRepositories.mockResolvedValue([repository]);
    api.getRepositoryIndexMetadata.mockResolvedValue(metadata);
    api.getRepositoryIndexingStatus.mockResolvedValue(null);
    api.getInvestigationHistory.mockResolvedValue([investigation]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows connect-repository onboarding when no repository is selected", async () => {
    api.getRepositories.mockResolvedValue([]);
    renderDashboard({ repositoryId: "" });

    expect(screen.getAllByText("No repository selected").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Connect repository" })[0])
      .toHaveAttribute("href", "#repositories");
    expect(api.getRepositoryIndexMetadata).not.toHaveBeenCalled();
  });

  it("guides a registered repository without an index to indexing", async () => {
    api.getRepositoryIndexMetadata.mockResolvedValue(null);
    api.getRepositoryIndexingStatus.mockResolvedValue(null);
    renderDashboard();

    expect(await screen.findByText("Example Service")).toBeVisible();
    expect(screen.getByText("D:\\work\\example-service")).toBeVisible();
    expect(screen.getByText("Not indexed")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Index repository" })[0])
      .toHaveAttribute("href", "#repositories");
  });

  it("shows last successful indexing and Ask Code and Make Change actions", async () => {
    renderDashboard();

    expect(await screen.findByText(/Last successful index: commit/)).toHaveTextContent(
      "abcdef01",
    );
    expect(screen.getAllByRole("link", { name: "Ask Code" })[0])
      .toHaveAttribute("href", "#ai-workspace");
    expect(screen.getByRole("link", { name: "Make Change" }))
      .toHaveAttribute("href", "#ai-workspace");
  });

  it("distinguishes a failed latest indexing attempt from the previous success", async () => {
    api.getRepositoryIndexingStatus.mockResolvedValue(makeJob("failed"));
    renderDashboard();

    expect(await screen.findByText(/latest attempt failed: Embedding service unavailable/i))
      .toBeVisible();
    expect(screen.getByText(/The previous successful index remains available/)).toBeVisible();
    expect(screen.getByText(/Last successful index: commit/)).toHaveTextContent("abcdef01");
  });

  it("uses navigation actions instead of inventing or executing repository changes", async () => {
    api.getRepositoryIndexMetadata.mockResolvedValue(null);
    api.getRepositoryIndexingStatus.mockResolvedValue(makeJob("completed"));
    renderDashboard();

    const indexLink = (await screen.findAllByRole("link", { name: "Index repository" }))[0];
    expect(indexLink).toHaveAttribute("href", "#repositories");
  });

  it("shows recent persisted investigations and opens them", async () => {
    const { onOpenInvestigation } = renderDashboard();

    const recent = await screen.findByRole("button", {
      name: /Where is the API client configured/,
    });
    expect(recent).toHaveTextContent("Reviewed");
    fireEvent.click(recent);
    expect(onOpenInvestigation).toHaveBeenCalledWith(investigation.id);
  });

  it("shows known current-session proposals and opens Review Center", async () => {
    const { onOpenProposal } = renderDashboard({ proposals: [proposal] });

    const proposalLink = await screen.findByRole("button", { name: /src\/client.ts/ });
    expect(proposalLink).toHaveTextContent("Awaiting review");
    fireEvent.click(proposalLink);
    expect(onOpenProposal).toHaveBeenCalledWith(proposal.id);
  });

  it("shows an empty state when backend history has no investigations", async () => {
    api.getInvestigationHistory.mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText(/No saved investigations yet/)).toBeVisible();
  });

  it("reports recent-investigation API errors and retries them", async () => {
    api.getInvestigationHistory
      .mockRejectedValueOnce(new Error("Investigation history unavailable"))
      .mockResolvedValueOnce([investigation]);
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Investigation history unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(investigation.question)).toBeVisible();
  });
});
