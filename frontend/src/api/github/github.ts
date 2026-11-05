import type { Repository } from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ImportGitHubRepositoryRequest {
  url: string;
}

export async function importGitHubRepository(
  request: ImportGitHubRepositoryRequest,
): Promise<Repository> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/repositories/import/github`,
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