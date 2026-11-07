import type {
  DevelopmentWorkflowDetail,
  DevelopmentWorkflowRequest,
  DevelopmentWorkflowResponse,
  DevelopmentWorkflowSummary,
} from "./types";
import { apiUrl } from "../config";

export async function runDevelopmentWorkflow(
  request: DevelopmentWorkflowRequest,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowResponse> {
  const response = await fetch(
    apiUrl("/api/v1/development/workflows"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Workflow request failed (${response.status})`);
  }

  return (await response.json()) as DevelopmentWorkflowResponse;
}

export async function getDevelopmentWorkflows(
  repositoryId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowSummary[]> {
  const params = new URLSearchParams({
    repository_id: repositoryId,
    limit: "50",
    offset: String(offset),
  });
  const response = await fetch(
    apiUrl(`/api/v1/development/workflows?${params.toString()}`),
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Could not load workflow history (${response.status})`);
  }

  return (await response.json()) as DevelopmentWorkflowSummary[];
}

export async function getDevelopmentWorkflow(
  workflowId: string,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowDetail> {
  const response = await fetch(
    apiUrl(`/api/v1/development/workflows/${encodeURIComponent(workflowId)}`),
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Could not load workflow details (${response.status})`);
  }

  return (await response.json()) as DevelopmentWorkflowDetail;
}
