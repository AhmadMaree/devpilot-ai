import type { Repository } from "../types";
import { apiUrl } from "../config";

export interface ImportGitHubRepositoryRequest {
  url: string;
}

export async function importGitHubRepository(
  request: ImportGitHubRepositoryRequest,
): Promise<Repository> {
  const response = await fetch(
    apiUrl("/api/v1/repositories/import/github"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);

    throw new Error(
      error?.detail ?? `GitHub import failed (${response.status})`,
    );
  }

  return (await response.json()) as Repository;
}