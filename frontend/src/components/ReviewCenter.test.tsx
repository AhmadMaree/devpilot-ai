import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PatchApiError,
  approvePatch,
  getPatchPreview,
  getPatchProposalDetails,
  rejectPatch,
} from "../api/patches/api";
import type {
  KnownPatchProposal,
  PatchPreview,
  PatchProposalDetails,
  PatchStatus,
} from "../api/patches/types";
import { ReviewCenter } from "./ReviewCenter";

vi.mock("../api/patches/api", () => ({
  PatchApiError: class PatchApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "PatchApiError";
      this.status = status;
    }
  },
  approvePatch: vi.fn(),
  getPatchPreview: vi.fn(),
  getPatchProposalDetails: vi.fn(),
  rejectPatch: vi.fn(),
  generatePatchProposal: vi.fn(),
}));

const activeRepositoryId = "active-repository";
const inactiveRepositoryId = "other-repository";
const pendingDetails: PatchProposalDetails = {
  id: "proposal-workflow",
  repository_id: activeRepositoryId,
  file_path: "src/auth.ts",
  explanation: "Improve the authentication error path.",
  status: "pending",
  created_at: "2026-11-05T16:00:00Z",
};
const preview: PatchPreview = {
  id: pendingDetails.id,
  repository_id: activeRepositoryId,
  file_path: pendingDetails.file_path,
  explanation: pendingDetails.explanation,
  status: "pending",
  diff: [
    "diff --git a/src/auth.ts b/src/auth.ts",
    "--- a/src/auth.ts",
    "+++ b/src/auth.ts",
    "@@ -10,2 +10,3 @@",
    " unchanged();",
    "-throw new Error('bad');",
    "+throw new Error('Authentication failed');",
  ].join("\n"),
};
const workflowProposal: KnownPatchProposal = {
  id: pendingDetails.id,
  repository_id: activeRepositoryId,
  source: "workflow",
  file_path: "src/auth.ts",
  request_context: "Add a useful authentication failure message.",
  known_at: "2026-11-05T16:00:00Z",
  workflow_feedback: {
    developer: "Prepared an updated error message.",
    reviewer: "Integrity checks passed.",
    reviewer_passed: true,
    qa: "Static checks passed; no tests executed.",
    qa_passed: true,
  },
  status: "pending",
};
const directProposal: KnownPatchProposal = {
  id: "proposal-direct",
  repository_id: activeRepositoryId,
  source: "direct",
  file_path: "src/legacy.ts",
  request_context: "Add input validation.",
  known_at: "2026-11-05T16:05:00Z",
  status: "pending",
};

function makeDetails(status: PatchStatus): PatchProposalDetails {
  return { ...pendingDetails, status };
}

function renderCenter(proposals: KnownPatchProposal[] = [workflowProposal], selected = workflowProposal.id) {
  const onProposalCreated = vi.fn();
  const onStatusChange = vi.fn();
  const onSelectProposal = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <ReviewCenter
        repositoryId={activeRepositoryId}
        proposals={proposals}
        selectedProposalId={selected}
        onSelectProposal={onSelectProposal}
        onProposalCreated={onProposalCreated}
        onStatusChange={onStatusChange}
      />
    </QueryClientProvider>,
  );
  return { onProposalCreated, onStatusChange, onSelectProposal };
}

describe("professional Review Center", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.mocked(getPatchProposalDetails).mockResolvedValue(pendingDetails);
    vi.mocked(getPatchPreview).mockResolvedValue(preview);
    vi.mocked(approvePatch).mockResolvedValue({
      id: pendingDetails.id,
      status: "applied",
      message: "Patch applied.",
    });
    vi.mocked(rejectPatch).mockResolvedValue({
      id: pendingDetails.id,
      status: "rejected",
      message: "Proposal rejected; no files changed.",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists known proposals for the active repository only", () => {
    renderCenter([
      workflowProposal,
      directProposal,
      { ...workflowProposal, id: "other", repository_id: inactiveRepositoryId },
    ], "not-selected");

    expect(screen.getByText("src/auth.ts")).toBeVisible();
    expect(screen.getByText("src/legacy.ts")).toBeVisible();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeVisible();
  });

  it("shows a clear empty state without inventing proposals", () => {
    renderCenter([], "");

    expect(screen.getByText("No known proposals for this repository")).toBeVisible();
    expect(screen.getByText(/previous browser sessions are not listed automatically/))
      .toBeVisible();
    expect(screen.queryByRole("button", { name: /proposal-workflow/i })).not.toBeInTheDocument();
  });

  it("renders unified diff additions and removals with distinct accessible rows", async () => {
    renderCenter();

    expect(await screen.findByRole("region", { name: "Unified patch diff" })).toBeVisible();
    const diffRegion = screen.getByRole("region", { name: "Unified patch diff" });
    expect(diffRegion.querySelector(".diff-added")).toHaveTextContent(
      "+throw new Error('Authentication failed')",
    );
    expect(diffRegion.querySelector(".diff-removed")).toHaveTextContent(
      "-throw new Error('bad');",
    );
    expect(screen.getByText("@@ -10,2 +10,3 @@").closest(".diff-hunk")).toBeInTheDocument();
  });

  it("shows workflow validation feedback and explains tests were not run", async () => {
    renderCenter();

    expect(await screen.findByText("Prepared an updated error message.")).toBeVisible();
    expect(screen.getByText("Integrity checks passed.")).toBeVisible();
    expect(screen.getByText("Static checks passed; no tests executed.")).toBeVisible();
    expect(screen.getByText(/project tests were not executed/)).toBeVisible();
  });

  it("labels direct patch proposals as the legacy generation path", () => {
    renderCenter([directProposal], directProposal.id);

    expect(screen.getByText("Legacy direct patch generator")).toBeVisible();
    expect(screen.getByText("Add input validation.")).toBeVisible();
  });

  it("requires explicit approval confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    fireEvent.click(screen.getByRole("button", { name: "Approve and apply" }));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Apply the proposed change to src/auth.ts"),
    );
    expect(approvePatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeEnabled();
  });

  it("approves after confirmation and refreshes authoritative status", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const detailsResponses = [
      pendingDetails,
      pendingDetails,
      makeDetails("applied"),
    ];
    vi.mocked(getPatchProposalDetails).mockImplementation(
      async () => detailsResponses.shift() ?? makeDetails("applied"),
    );
    const { onStatusChange } = renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    fireEvent.click(screen.getByRole("button", { name: "Approve and apply" }));

    expect(await screen.findByText("Patch applied.")).toBeVisible();
    await waitFor(() => {
      expect(getPatchProposalDetails).toHaveBeenCalledTimes(3);
      expect(onStatusChange).toHaveBeenCalledWith(pendingDetails.id, "applied");
    });
    expect(screen.getAllByText("Applied")).toHaveLength(2);
  });

  it("rejects a pending proposal without applying repository changes", async () => {
    const detailsResponses = [
      pendingDetails,
      pendingDetails,
      makeDetails("rejected"),
    ];
    vi.mocked(getPatchProposalDetails).mockImplementation(
      async () => detailsResponses.shift() ?? makeDetails("rejected"),
    );
    renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Proposal rejected; no files changed.")).toBeVisible();
    expect(rejectPatch).toHaveBeenCalledWith(workflowProposal.id);
    expect(approvePatch).not.toHaveBeenCalled();
    expect(await screen.findAllByText("Rejected")).not.toHaveLength(0);
  });

  it("explains stale-file and SHA conflicts and disables unsafe approval", async () => {
    vi.mocked(getPatchPreview).mockRejectedValue(
      new PatchApiError("File changed since proposal creation", 409),
    );
    renderCenter();

    expect(await screen.findByText(/File changed since proposal creation/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("handles action conflicts and refreshes proposal status", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(approvePatch).mockRejectedValue(
      new PatchApiError("Proposal is no longer pending", 409),
    );
    const detailsResponses = [
      pendingDetails,
      pendingDetails,
      makeDetails("applied"),
    ];
    vi.mocked(getPatchProposalDetails).mockImplementation(
      async () => detailsResponses.shift() ?? makeDetails("applied"),
    );
    renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    fireEvent.click(screen.getByRole("button", { name: "Approve and apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The repository file changed or this proposal is no longer pending.",
    );
    expect(await screen.findAllByText("Applied")).not.toHaveLength(0);
  });

  it("reports service failures without losing the pending proposal state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(approvePatch).mockRejectedValue(
      new PatchApiError("Patch service unavailable", 503),
    );
    renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    fireEvent.click(screen.getByRole("button", { name: "Approve and apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Patch service unavailable");
    expect(screen.getByText("Awaiting your review")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeEnabled();
  });

  it("prevents duplicate approval requests while one is in progress", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveApproval: (value: { id: string; status: "applied"; message: string }) => void =
      () => undefined;
    vi.mocked(approvePatch).mockImplementation(() => new Promise((resolve) => {
      resolveApproval = resolve;
    }));
    renderCenter();
    await screen.findByRole("region", { name: "Unified patch diff" });

    const approveButton = screen.getByRole("button", { name: "Approve and apply" });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(approvePatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    resolveApproval({ id: pendingDetails.id, status: "applied", message: "Applied." });
    await screen.findByText("Applied.");
  });

  it("does not approve automatically and provides navigation back to AI Workspace", () => {
    renderCenter([workflowProposal], "");

    expect(approvePatch).not.toHaveBeenCalled();
    const backLink = screen.getAllByRole("link", { name: "Back to AI Workspace" })[0];
    expect(backLink).toHaveAttribute("href", "#ai-workspace");
  });

  it("handles missing proposals and already-final statuses", async () => {
    vi.mocked(getPatchProposalDetails).mockRejectedValue(
      new PatchApiError("Patch proposal not found", 404),
    );
    renderCenter();
    expect(await screen.findByRole("alert")).toHaveTextContent("This proposal no longer exists");
    expect(approvePatch).not.toHaveBeenCalled();

    cleanup();
    vi.mocked(getPatchProposalDetails).mockResolvedValue(makeDetails("rejected"));
    renderCenter([{ ...workflowProposal, status: "rejected" }]);
    await screen.findByRole("region", { name: "Unified patch diff" });
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeDisabled();

    cleanup();
    vi.mocked(getPatchProposalDetails).mockResolvedValue(makeDetails("applied"));
    renderCenter([{ ...workflowProposal, status: "applied" }]);
    await screen.findByRole("region", { name: "Unified patch diff" });
    expect(screen.getAllByText("Applied")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeDisabled();
  });
});
