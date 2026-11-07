import type {
  IndexingJob,
  Repository,
  RepositoryIndexMetadata,
} from "./types";
import { apiUrl } from "./config";

async function responseError(response: Response): Promise<Error> {
  let message = `Request failed (${response.status})`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      message = body.detail;
    }
  } catch {
    // Keep the HTTP status when the server does not return JSON.
  }
  return new Error(message);
}

export async function getRepositories(
  signal?: AbortSignal,
): Promise<Repository[]> {
  const response = await fetch(apiUrl("/api/v1/repositories"), {
    signal,
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as Repository[];
}

export async function registerRepository(
  name: string,
  path: string,
  signal?: AbortSignal,
): Promise<Repository> {
  const response = await fetch(apiUrl("/api/v1/repositories"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, path }),
    signal,
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as Repository;
}

export async function startRepositoryIndexing(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<IndexingJob> {
  const response = await fetch(
    apiUrl(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/index`),
    { method: "POST", signal },
  );
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as IndexingJob;
}

export async function getRepositoryIndexingStatus(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<IndexingJob | null> {
  const response = await fetch(
    apiUrl(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/index/status`),
    { signal },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as IndexingJob;
}

export async function getRepositoryIndexMetadata(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<RepositoryIndexMetadata | null> {
  const response = await fetch(
    apiUrl(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/index`),
    { signal },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as RepositoryIndexMetadata;
}
