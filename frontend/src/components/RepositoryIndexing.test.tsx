import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IndexingJob,
  Repository,
  RepositoryIndexMetadata,
} from "../api/types";
import { RepositoryIndexing } from "./RepositoryIndexing";

const api = vi.hoisted(() => ({
  getRepositories: vi.fn(),
  getRepositoryIndexMetadata: vi.fn(),
  getRepositoryIndexingStatus: vi.fn(),
  registerRepository: vi.fn(),
  startRepositoryIndexing: vi.fn(),
  importGitHubRepository: vi.fn(),
}));

vi.mock("../api/repositories", () => ({
  getRepositories: api.getRepositories,
  getRepositoryIndexMetadata: api.getRepositoryIndexMetadata,
  getRepositoryIndexingStatus: api.getRepositoryIndexingStatus,
  registerRepository: api.registerRepository,
  startRepositoryIndexing: api.startRepositoryIndexing,
}));

vi.mock("../api/github/github", () => ({
  importGitHubRepository: api.importGitHubRepository,
}));

const localRepository: Repository = {
  id: "repo-local",
  name: "Sample App",
  path: "D:\\work\\sample-app",
  created_at: "2026-11-05T10:00:00Z",
};

const importedRepository: Repository = {
  id: "repo-github",
  name: "octocat/hello-world",
  path: "D:\\devpilot-repositories\\hello-world",
  created_at: "2026-11-05T10:00:00Z",
};

const successfulMetadata: RepositoryIndexMetadata = {
  repository_id: localRepository.id,
  commit_sha: "1234567890abcdef",
  indexed_at: "2026-11-05T10:30:00Z",
  index_version: "version-1",
};

function makeJob(
  status: IndexingJob["status"],
  phase: string,
  processed = 0,
  total = 0,
  error_message: string | null = null,
): IndexingJob {
  return {
    job_id: "job-1",
    repository_id: localRepository.id,
    status,
    phase,
    processed_chunks: processed,
    total_chunks: total,
    created_at: "2026-11-05T10:00:00Z",
    started_at: status === "queued" ? null : "2026-11-05T10:00:01Z",
    completed_at: status === "completed" || status === "failed"
      ? "2026-11-05T10:01:00Z"
      : null,
    error_message,
  };
}

function renderRepositories(
  onRepositoryChange = vi.fn(),
  selectedRepositoryId = localRepository.id,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RepositoryIndexing
        selectedRepositoryId={selectedRepositoryId}
        onRepositoryChange={onRepositoryChange}
      />
    </QueryClientProvider>,
  );
  return { ...view, onRepositoryChange, queryClient };
}

describe("repository onboarding and management", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    api.getRepositories.mockResolvedValue([localRepository]);
    api.getRepositoryIndexingStatus.mockResolvedValue(null);
    api.getRepositoryIndexMetadata.mockResolvedValue(null);
    api.registerRepository.mockResolvedValue(importedRepository);
    api.startRepositoryIndexing.mockResolvedValue(makeJob("queued", "queued"));
    api.importGitHubRepository.mockResolvedValue(importedRepository);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("imports a public GitHub repository and selects it", async () => {
    const onRepositoryChange = vi.fn();
    api.getRepositories.mockResolvedValue([localRepository, importedRepository]);
    renderRepositories(onRepositoryChange);

    fireEvent.change(screen.getByLabelText("GitHub repository URL"), {
      target: { value: "https://github.com/octocat/hello-world" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import from GitHub" }));

    await waitFor(() => {
      expect(api.importGitHubRepository).toHaveBeenCalledWith({
        url: "https://github.com/octocat/hello-world",
      });
      expect(onRepositoryChange).toHaveBeenCalledWith(
        importedRepository.id,
        importedRepository.name,
      );
    });
    expect(await screen.findByText("octocat/hello-world")).toBeVisible();
  });

  it("registers a local Git repository", async () => {
    renderRepositories();

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Local app" },
    });
    fireEvent.change(screen.getByLabelText("Git repository root path"), {
      target: { value: "D:\\work\\local-app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register repository" }));

    await waitFor(() => {
      expect(api.registerRepository).toHaveBeenCalledWith(
        "Local app",
        "D:\\work\\local-app",
      );
    });
  });

  it("marks the selected repository and reports indexing progress", async () => {
    api.getRepositoryIndexingStatus.mockResolvedValue(
      makeJob("running", "embedding", 8, 24),
    );
    renderRepositories();

    const selectionButton = await screen.findByRole("button", {
      name: "Selected repository",
    });
    expect(selectionButton).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Indexing: embedding")).toBeVisible();
    expect(screen.getByText("8 / 24 chunks")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Indexing Sample App" })).toHaveAttribute(
      "max",
      "24",
    );
  });

  it("selects another registered repository as active", async () => {
    const onRepositoryChange = vi.fn();
    api.getRepositories.mockResolvedValue([localRepository, importedRepository]);
    renderRepositories(onRepositoryChange);

    fireEvent.click(await screen.findByRole("button", {
      name: "Select repository",
    }));

    expect(onRepositoryChange).toHaveBeenCalledWith(
      importedRepository.id,
      importedRepository.name,
    );
  });

  it("shows failed reindex while retaining the last successful index", async () => {
    api.getRepositoryIndexingStatus.mockResolvedValue(
      makeJob(
        "failed",
        "failed",
        8,
        24,
        "Repository contains uncommitted changes. Commit or clean the repository before ingestion.",
      ),
    );
    api.getRepositoryIndexMetadata.mockResolvedValue(successfulMetadata);
    renderRepositories();

    expect(await screen.findByText("Latest indexing attempt failed")).toBeVisible();
    expect(
      screen.getByText(/DevPilot will not modify your Git working tree/),
    ).toBeVisible();
    expect(
      screen.getByText(/previous successful index from commit 12345678 is preserved/),
    ).toBeVisible();
    expect(screen.getByText("Last successful index")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry indexing" })).toBeEnabled();
  });

  it("shows successful index metadata and enables the AI workspace action", async () => {
    api.getRepositoryIndexingStatus.mockResolvedValue(
      makeJob("completed", "completed", 24, 24),
    );
    api.getRepositoryIndexMetadata.mockResolvedValue(successfulMetadata);
    renderRepositories();

    expect(await screen.findByText("Latest indexing completed")).toBeVisible();
    expect(await screen.findByText("Last successful index")).toBeVisible();
    expect(screen.getByText("Commit 12345678")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open AI Workspace" })).toHaveAttribute(
      "href",
      "#ai-workspace",
    );
  });

  it("starts indexing and navigates to AI Workspace when requested", async () => {
    const onRepositoryChange = vi.fn();
    api.getRepositoryIndexMetadata.mockResolvedValue(successfulMetadata);
    renderRepositories(onRepositoryChange);

    fireEvent.click(await screen.findByRole("button", { name: "Re-index repository" }));
    await waitFor(() => {
      expect(api.startRepositoryIndexing).toHaveBeenCalledWith(localRepository.id);
    });

    const workspaceLink = await screen.findByRole("link", {
      name: "Open AI Workspace",
    });
    expect(workspaceLink).toHaveAttribute("href", "#ai-workspace");
  });
});
