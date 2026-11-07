import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getRepositories,
  getRepositoryIndexMetadata,
  getRepositoryIndexingStatus,
  registerRepository,
  startRepositoryIndexing,
} from "../api/repositories";
import { queryKeys } from "../api/queryKeys";
import type {
  IndexingJob,
  Repository,
} from "../api/types";
import { importGitHubRepository } from "../api/github/github";

interface RepositoryIndexingProps {
  selectedRepositoryId: string;
  onRepositoryChange: (repositoryId: string, repositoryName: string | null) => void;
}

function isActive(job: IndexingJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

function indexingErrorMessage(message: string): string {
  if (/uncommitted changes/i.test(message)) {
    return `${message} DevPilot will not modify your Git working tree. Commit or safely save your changes yourself, then retry indexing.`;
  }
  return message;
}

export function RepositoryIndexing({
  selectedRepositoryId,
  onRepositoryChange,
}: RepositoryIndexingProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const repositoriesQuery = useQuery({
    queryKey: queryKeys.repositories.all,
    queryFn: ({ signal }) => getRepositories(signal),
  });
  const repositories = useMemo(
    () => repositoriesQuery.data ?? [],
    [repositoriesQuery.data],
  );

  useEffect(() => {
    if (!repositoriesQuery.data) return;
    const selected = repositories.find(
      (repository) => repository.id === selectedRepositoryId,
    ) ?? repositories[0] ?? null;

    if (selected?.id !== selectedRepositoryId) {
      onRepositoryChange(selected?.id ?? "", selected?.name ?? null);
    } else if (selected) {
      onRepositoryChange(selected.id, selected.name);
    }
  }, [onRepositoryChange, repositories, repositoriesQuery.data, selectedRepositoryId]);

  const registerMutation = useMutation({
    mutationFn: () => registerRepository(name.trim(), path.trim()),
    onSuccess: async (repository) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.repositories.all });
      onRepositoryChange(repository.id, repository.name);
      setName("");
      setPath("");
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registerMutation.isPending || !name.trim() || !path.trim()) return;
    setFormError(null);
    registerMutation.mutate();
  }

  async function handleImported(repository: Repository) {
    queryClient.setQueryData<Repository[]>(queryKeys.repositories.all, (current = []) => [
      ...current.filter((item) => item.id !== repository.id),
      repository,
    ]);
    onRepositoryChange(repository.id, repository.name);
    await queryClient.invalidateQueries({ queryKey: queryKeys.repositories.all });
  }

  return (
    <div className="repository-onboarding">
      <section className="panel repository-connect-panel" aria-labelledby="connect-title">
        <div className="repository-section-heading">
          <span className="step-number">1</span>
          <div>
            <h2 id="connect-title">Connect a repository</h2>
            <p className="muted">
              Register a local Git repository or import a public GitHub repository.
            </p>
          </div>
        </div>

        <div className="repository-connect-grid">
          <form className="repository-register-form" onSubmit={submitRegistration}>
            <h3>Register local repository</h3>
            <label htmlFor="repository-name">Display name</label>
            <input
              id="repository-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My application"
              maxLength={100}
              required
              disabled={registerMutation.isPending}
            />
            <label htmlFor="repository-path">Git repository root path</label>
            <input
              id="repository-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="D:\Projects\my-app"
              required
              disabled={registerMutation.isPending}
            />
            <p className="form-hint">
              Enter the root directory of an existing Git repository.
            </p>
            {formError && (
              <p className="repository-error" role="alert">{formError}</p>
            )}
            <button type="submit" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "Registering…" : "Register repository"}
            </button>
          </form>

          <div className="repository-github-import">
            <h3>Import public GitHub repository</h3>
            <p className="muted">
              DevPilot clones the public repository into its local workspace.
            </p>
            <GitHubImportForm onImported={(repository) => void handleImported(repository)} />
          </div>
        </div>
      </section>

      <section className="panel repository-list-panel" aria-labelledby="repositories-title">
        <div className="repository-section-heading">
          <span className="step-number">2</span>
          <div>
            <h2 id="repositories-title">Select and prepare</h2>
            <p className="muted">
              Choose the active repository, then create or refresh its searchable index.
            </p>
            <p className="muted">
              Repository records include the local path; remote GitHub origin URLs are not
              retained by the current API.
            </p>
          </div>
        </div>

        {repositoriesQuery.isPending ? (
          <p role="status">Loading registered repositories…</p>
        ) : repositoriesQuery.isError ? (
          <div className="repository-error-state" role="alert">
            <p>Could not load repositories: {repositoriesQuery.error.message}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void repositoriesQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : repositories.length === 0 ? (
          <div className="repository-empty-state">
            <strong>No repositories connected yet</strong>
            <p className="muted">
              Start with a local Git repository or import a public GitHub project above.
            </p>
          </div>
        ) : (
          <div className="repository-card-list">
            {repositories.map((repository) => (
              <RepositoryCard
                key={repository.id}
                repository={repository}
                selected={repository.id === selectedRepositoryId}
                onSelect={() => onRepositoryChange(repository.id, repository.name)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface GitHubImportFormProps {
  onImported: (repository: Repository) => void;
}

function GitHubImportForm({ onImported }: GitHubImportFormProps) {
  const [url, setUrl] = useState("");
  const importMutation = useMutation({
    mutationFn: ({
      url: repositoryUrl,
      signal,
    }: {
      url: string;
      signal?: AbortSignal;
    }) => signal
      ? importGitHubRepository({ url: repositoryUrl }, signal)
      : importGitHubRepository({ url: repositoryUrl }),
    onSuccess: (repository) => {
      setUrl("");
      onImported(repository);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importMutation.isPending) return;
    importMutation.mutate({ url: url.trim() });
  }

  return (
    <form className="repository-register-form" onSubmit={submit}>
      <label htmlFor="repository-github-url">GitHub repository URL</label>
      <input
        id="repository-github-url"
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://github.com/owner/repository"
        required
        disabled={importMutation.isPending}
      />
      {importMutation.error && (
        <p className="repository-error" role="alert">{importMutation.error.message}</p>
      )}
      <button type="submit" disabled={importMutation.isPending}>
        {importMutation.isPending ? "Importing repository…" : "Import from GitHub"}
      </button>
    </form>
  );
}

interface RepositoryCardProps {
  repository: Repository;
  selected: boolean;
  onSelect: () => void;
}

function RepositoryCard({ repository, selected, onSelect }: RepositoryCardProps) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.indexing.status(repository.id),
    queryFn: ({ signal }) => getRepositoryIndexingStatus(repository.id, signal),
    refetchInterval: (query) => isActive(query.state.data) ? 2000 : false,
  });
  const metadataQuery = useQuery({
    queryKey: queryKeys.indexing.metadata(repository.id),
    queryFn: ({ signal }) => getRepositoryIndexMetadata(repository.id, signal),
  });
  const indexMutation = useMutation({
    mutationFn: () => startRepositoryIndexing(repository.id),
    onSuccess: async (job) => {
      queryClient.setQueryData(
        queryKeys.indexing.status(repository.id),
        job,
      );
    },
  });
  const job = statusQuery.data;
  const metadata = metadataQuery.data;
  const running = isActive(job);

  useEffect(() => {
    if (job?.status === "completed") {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.indexing.metadata(repository.id),
      });
    }
  }, [job?.completed_at, job?.status, queryClient, repository.id]);

  const indexingError = job?.status === "failed" ? job.error_message : null;
  const showError = indexingError
    ? indexingErrorMessage(indexingError)
    : indexMutation.error?.message;

  return (
    <article
      className={`repository-card${selected ? " repository-card-active" : ""}`}
      aria-label={`${repository.name}${selected ? ", active repository" : ""}`}
    >
      <div className="repository-card-header">
        <div className="repository-card-title">
          <h3>{repository.name}</h3>
          {selected && <span className="active-repository-badge">Active</span>}
        </div>
        <span className={`repository-status-pill ${metadata ? "status-indexed" : "status-not-indexed"}`}>
          {metadata ? "Indexed" : "Not indexed"}
        </span>
      </div>
      <dl className="repository-details">
        <div>
          <dt>Local location</dt>
          <dd title={repository.path}>{repository.path}</dd>
        </div>
        <div>
          <dt>Indexing</dt>
          <dd>
            {statusQuery.isPending
              ? "Checking status…"
              : statusQuery.isError
                ? "Status unavailable"
                : job?.status ?? "Not started"}
          </dd>
        </div>
      </dl>

      {statusQuery.isError && (
        <div className="repository-error-state" role="alert">
          <p>Could not load indexing status: {statusQuery.error.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void statusQuery.refetch()}
          >
            Retry status
          </button>
        </div>
      )}

      {job && (running || job.status === "completed") && (
        <div className="repository-index-progress" role="status">
          <div className="repository-progress-label">
            <strong>{running ? `Indexing: ${job.phase}` : "Latest indexing completed"}</strong>
            <span>{job.processed_chunks} / {job.total_chunks} chunks</span>
          </div>
          {job.total_chunks > 0 && (
            <progress
              value={job.processed_chunks}
              max={job.total_chunks}
              aria-label={`Indexing ${repository.name}`}
            />
          )}
        </div>
      )}

      {metadata && (
        <div className="repository-index-metadata">
          <strong>Last successful index</strong>
          <span>Commit {metadata.commit_sha.slice(0, 8)}</span>
          <span>{new Date(metadata.indexed_at).toLocaleString()}</span>
        </div>
      )}

      {job?.status === "failed" && (
        <div className="repository-failure" role="alert">
          <strong>Latest indexing attempt failed</strong>
          <p>{showError || "Indexing failed. Retry when the repository is ready."}</p>
          {metadata && (
            <p>
              Your previous successful index from commit {metadata.commit_sha.slice(0, 8)}
              {" "}is preserved.
            </p>
          )}
        </div>
      )}
      {indexMutation.isError && job?.status !== "failed" && (
        <p className="repository-error" role="alert">{showError}</p>
      )}
      {metadataQuery.isError && (
        <p className="repository-error" role="alert">
          Could not load successful index metadata: {metadataQuery.error.message}
        </p>
      )}

      <div className="repository-card-actions">
        <button
          type="button"
          className={selected ? "secondary-button repository-selected-button" : "secondary-button"}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? "Selected repository" : "Select repository"}
        </button>
        <button
          type="button"
          onClick={() => indexMutation.mutate()}
          disabled={running || indexMutation.isPending}
        >
          {running
            ? "Indexing…"
            : indexMutation.isPending
              ? "Starting…"
              : job?.status === "failed"
                ? "Retry indexing"
                : metadata
                  ? "Re-index repository"
                  : "Index repository"}
        </button>
        {selected && metadata && (
          <a className="primary-link" href="#ai-workspace">
            Open AI Workspace
          </a>
        )}
      </div>
    </article>
  );
}
