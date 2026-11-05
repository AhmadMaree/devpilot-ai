import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvestigationSummary, Repository } from "../api/types";
import type { KnownPatchProposal } from "../api/patches/types";
import { Activity } from "./Activity";

const api = vi.hoisted(() => ({
  getInvestigationHistory: vi.fn(),
  getRepositories: vi.fn(),
}));

vi.mock("../api/api", () => ({
  getInvestigationHistory: api.getInvestigationHistory,
}));

vi.mock("../api/repositories", () => ({
  getRepositories: api.getRepositories,
}));

const repository: Repository = {
  id: "repo-1",
  name: "Example Service",
  path: "D:\\work\\example-service",
  created_at: "2026-11-05T10:00:00Z",
};

const investigation: InvestigationSummary = {
  id: "saved-investigation",
  repository_id: repository.id,
  question: "Where is the API client configured?",
  review_passed: false,
  created_at: "2026-11-05T11:00:00Z",
};

const workflowProposal: KnownPatchProposal = {
  id: "workflow-proposal",
  repository_id: repository.id,
  source: "workflow",
  file_path: "src/client.ts",
  request_context: "Add retry handling.",
  known_at: "2026-11-05T12:00:00Z",
  status: "pending",
};

const directProposal: KnownPatchProposal = {
  id: "direct-proposal",
  repository_id: repository.id,
  source: "direct",
  file_path: "src/legacy.ts",
  request_context: "Fix input validation.",
  known_at: "2026-11-05T12:10:00Z",
  status: "rejected",
};

function renderActivity(options?: {
  investigations?: InvestigationSummary[];
  proposals?: KnownPatchProposal[];
}) {
  const onOpenInvestigation = vi.fn();
  const onOpenProposal = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <Activity
        proposals={options?.proposals ?? []}
        selectedInvestigationId={null}
        openError={null}
        onOpenInvestigation={onOpenInvestigation}
        onOpenProposal={onOpenProposal}
      />
    </QueryClientProvider>,
  );
  return { onOpenInvestigation, onOpenProposal };
}

describe("Activity experience", () => {
  beforeEach(() => {
    api.getInvestigationHistory.mockReset();
    api.getRepositories.mockReset();
    api.getInvestigationHistory.mockResolvedValue([investigation]);
    api.getRepositories.mockResolvedValue([repository]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading state while persisted history is loading", async () => {
    let resolveHistory: (items: InvestigationSummary[]) => void = () => undefined;
    api.getInvestigationHistory.mockImplementation(() => new Promise((resolve) => {
      resolveHistory = resolve;
    }));
    renderActivity();

    expect(screen.getByText("Loading saved investigations…")).toBeVisible();
    await act(async () => resolveHistory([]));
    expect(await screen.findByText("No saved investigations yet")).toBeVisible();
  });

  it("shows a clear error and supports retrying history", async () => {
    api.getInvestigationHistory
      .mockRejectedValueOnce(new Error("History service unavailable"))
      .mockResolvedValueOnce([investigation]);
    renderActivity();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(investigation.question)).toBeVisible();
  });

  it("shows an empty state and links to Ask Code when no persisted history exists", async () => {
    api.getInvestigationHistory.mockResolvedValue([]);
    renderActivity();

    expect(await screen.findByText("No saved investigations yet")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Open AI Workspace" })[0]).toHaveAttribute(
      "href",
      "#ai-workspace",
    );
  });

  it("labels saved investigation history separately from session-only workflow proposals", async () => {
    const { onOpenInvestigation, onOpenProposal } = renderActivity({
      proposals: [workflowProposal, directProposal],
    });

    expect(await screen.findByText("Persisted investigation records available from the backend."))
      .toBeVisible();
    expect(screen.getByText("CURRENT BROWSER SESSION")).toBeVisible();
    expect(screen.getByText(/Failed runs and proposals from earlier sessions are not available here/))
      .toBeVisible();
    expect(screen.getByText("src/client.ts")).toBeVisible();
    expect(screen.queryByText("src/legacy.ts")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Where is the API client configured/ }));
    expect(onOpenInvestigation).toHaveBeenCalledWith(investigation.id);
    fireEvent.click(screen.getByRole("button", { name: /src\/client.ts/ }));
    expect(onOpenProposal).toHaveBeenCalledWith(workflowProposal.id);
  });

  it("shows retained current-session proposals as session-only, timestamped activity", async () => {
    renderActivity({ proposals: [workflowProposal] });

    const row = await screen.findByRole("button", { name: /src\/client.ts/ });
    expect(row).toHaveTextContent("Add retry handling.");
    expect(row).toHaveTextContent("Awaiting review");
    expect(row).toHaveTextContent(new Date(workflowProposal.known_at).toLocaleString());
  });
});
