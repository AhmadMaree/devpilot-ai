import { useEffect, useRef, useState } from "react";

import {
  getRepositories,
  getRepositoryIndexMetadata,
  getRepositoryIndexingStatus,
  startRepositoryIndexing,
} from "../api/repositories";
import type {
  IndexingJob,
  Repository,
  RepositoryIndexMetadata,
} from "../api/types";

interface RepositoryIndexingProps {
  selectedRepositoryId: string;
  onRepositoryChange: (repositoryId: string) => void;
}

interface RepositoryIndexStatusProps {
  repositoryId: string;
  repositoryName: string;
  loadingRepositories: boolean;
}

function isActive(job: IndexingJob | null): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function RepositoryIndexing({
  selectedRepositoryId,
  onRepositoryChange,
}: RepositoryIndexingProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepositories, setLoadingRepositories] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedRepositoryIdRef = useRef(selectedRepositoryId);

  useEffect(() => {
    selectedRepositoryIdRef.current = selectedRepositoryId;
  }, [selectedRepositoryId]);

  useEffect(() => {
    const controller = new AbortController();
    void getRepositories(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }
        setRepositories(items);
        const selectedExists = items.some(
          (item) => item.id === selectedRepositoryIdRef.current,
        );
        if (!selectedExists) {
          onRepositoryChange(items[0]?.id ?? "");
        }
      })
      .catch((caughtError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load repositories.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingRepositories(false);
        }
      });

    return () => controller.abort();
  }, [onRepositoryChange]);

  const selectedRepository = repositories.find(
    (repository) => repository.id === selectedRepositoryId,
  );

  return (
    <section className="panel repository-index-panel">
      <div className="result-header">
        <div>
          <h2>Repository Index</h2>
          <p className="muted">
            Index a registered Git repository for investigation.
          </p>
        </div>
      </div>

      <label className="field-label" htmlFor="repository-select">
        Registered repository
      </label>
      <select
        id="repository-select"
        value={selectedRepositoryId}
        onChange={(event) => onRepositoryChange(event.target.value)}
        disabled={loadingRepositories || repositories.length === 0}
      >
        {repositories.length === 0 ? (
          <option value="">
            {loadingRepositories
              ? "Loading repositories..."
              : "No repositories registered"}
          </option>
        ) : (
          repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.name} — {repository.path}
            </option>
          ))
        )}
      </select>

      {!loadingRepositories && repositories.length === 0 && (
        <p className="muted">
          Register a repository through the API before indexing it.
        </p>
      )}
      {error && (
        <p className="indexing-error" role="alert">
          {error}
        </p>
      )}

      {selectedRepository && (
        <RepositoryIndexStatus
          key={selectedRepository.id}
          repositoryId={selectedRepository.id}
          repositoryName={selectedRepository.name}
          loadingRepositories={loadingRepositories}
        />
      )}
    </section>
  );
}

function RepositoryIndexStatus({
  repositoryId,
  repositoryName,
  loadingRepositories,
}: RepositoryIndexStatusProps) {
  const [job, setJob] = useState<IndexingJob | null>(null);
  const [metadata, setMetadata] =
    useState<RepositoryIndexMetadata | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startControllerRef = useRef<AbortController | null>(null);
  const currentJobId = job?.job_id;
  const currentStatus = job?.status;
  const shouldPoll =
    currentStatus === "queued" || currentStatus === "running";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void getRepositoryIndexingStatus(repositoryId, controller.signal)
      .then((latestJob) => {
        if (active) {
          setJob(latestJob);
        }
      })
      .catch((caughtError: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load indexing status.",
          );
        }
      });
    void getRepositoryIndexMetadata(repositoryId, controller.signal)
      .then((latestMetadata) => {
        if (active) {
          setMetadata(latestMetadata);
        }
      })
      .catch((caughtError: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load index metadata.",
          );
        }
      });

    return () => {
      active = false;
      controller.abort();
      startControllerRef.current?.abort();
    };
  }, [repositoryId]);

  useEffect(() => {
    if (currentJobId === undefined || !shouldPoll) {
      return;
    }

    let active = true;
    let timeoutId: number | undefined;
    let controller: AbortController | undefined;

    const poll = async () => {
      controller = new AbortController();
      try {
        const latest = await getRepositoryIndexingStatus(
          repositoryId,
          controller.signal,
        );
        if (active && latest) {
          setJob(latest);
        }
      } catch (caughtError) {
        if (active && !controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not refresh indexing status.",
          );
        }
      } finally {
        if (active) {
          timeoutId = window.setTimeout(() => void poll(), 2000);
        }
      }
    };

    timeoutId = window.setTimeout(() => void poll(), 2000);

    return () => {
      active = false;
      controller?.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [currentJobId, shouldPoll, repositoryId]);

  useEffect(() => {
    if (currentJobId === undefined || currentStatus !== "completed") {
      return;
    }

    const controller = new AbortController();
    void getRepositoryIndexMetadata(repositoryId, controller.signal)
      .then(setMetadata)
      .catch((caughtError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load index metadata.",
          );
        }
      });
    return () => controller.abort();
  }, [currentJobId, currentStatus, repositoryId]);

  async function indexRepository() {
    setStarting(true);
    setError(null);
    const controller = new AbortController();
    startControllerRef.current = controller;
    try {
      const newJob = await startRepositoryIndexing(
        repositoryId,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setJob(newJob);
      }
    } catch (caughtError) {
      if (!controller.signal.aborted) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not start repository indexing.",
        );
      }
    } finally {
      if (startControllerRef.current === controller) {
        startControllerRef.current = null;
        setStarting(false);
      }
    }
  }

  const isIndexing = isActive(job);

  return (
    <>
      <button
        type="button"
        onClick={() => void indexRepository()}
        disabled={loadingRepositories || starting || isIndexing}
      >
        {starting
          ? "Starting..."
          : job?.status === "failed"
            ? "Retry indexing"
            : isIndexing
              ? "Indexing..."
              : "Index Repository"}
      </button>

      {job && (
        <div className="indexing-status" role="status">
          <div className="result-header">
            <strong>
              {repositoryName}: {job.status}
            </strong>
            <span>{job.phase}</span>
          </div>
          <p className="muted">
            Processed {job.processed_chunks} of {job.total_chunks} chunks
          </p>
          {job.total_chunks > 0 && (
            <progress
              value={job.processed_chunks}
              max={job.total_chunks}
              aria-label="Repository indexing progress"
            />
          )}
          {job.status === "failed" && job.error_message && (
            <p className="indexing-error" role="alert">
              {job.error_message}
            </p>
          )}
        </div>
      )}

      {metadata && (
        <p className="muted">
          Indexed commit {metadata.commit_sha.slice(0, 8)} on{" "}
          {new Date(metadata.indexed_at).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="indexing-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
