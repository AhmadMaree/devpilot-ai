import type {
  IndexingJob,
  Repository,
  RepositoryIndexMetadata,
} from "./types";
import { apiClient } from "./client";
import { ApiError } from "./errors";

export async function getRepositories(
  signal?: AbortSignal,
): Promise<Repository[]> {
  const response = await apiClient.get<Repository[]>("/repositories", { signal });
  return response.data;
}

export async function registerRepository(
  name: string,
  path: string,
  signal?: AbortSignal,
): Promise<Repository> {
  const response = await apiClient.post<Repository>(
    "/repositories",
    { name, path },
    { signal },
  );
  return response.data;
}

export async function startRepositoryIndexing(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<IndexingJob> {
  const response = await apiClient.post<IndexingJob>(
    `/repositories/${encodeURIComponent(repositoryId)}/index`,
    undefined,
    { signal, timeout: 30_000 },
  );
  return response.data;
}

export async function getRepositoryIndexingStatus(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<IndexingJob | null> {
  try {
    const response = await apiClient.get<IndexingJob>(
      `/repositories/${encodeURIComponent(repositoryId)}/index/status`,
      { signal },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getRepositoryIndexMetadata(
  repositoryId: string,
  signal?: AbortSignal,
): Promise<RepositoryIndexMetadata | null> {
  try {
    const response = await apiClient.get<RepositoryIndexMetadata>(
      `/repositories/${encodeURIComponent(repositoryId)}/index`,
      { signal },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
