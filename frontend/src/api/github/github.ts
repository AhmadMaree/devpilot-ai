import type { Repository } from "../types";
import { apiClient } from "../client";

export interface ImportGitHubRepositoryRequest {
  url: string;
}

export async function importGitHubRepository(
  request: ImportGitHubRepositoryRequest,
  signal?: AbortSignal,
): Promise<Repository> {
  const response = await apiClient.post<Repository>(
    "/repositories/import/github",
    request,
    { signal, timeout: 300_000 },
  );
  return response.data;
}