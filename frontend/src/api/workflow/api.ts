import { apiClient } from "../client";
import type {
  DevelopmentWorkflowDetail,
  DevelopmentWorkflowRequest,
  DevelopmentWorkflowResponse,
  DevelopmentWorkflowSummary,
} from "./types";

export async function runDevelopmentWorkflow(
  request: DevelopmentWorkflowRequest,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowResponse> {
  const response = await apiClient.post<DevelopmentWorkflowResponse>(
    "/development/workflows",
    request,
    { signal, timeout: 180_000 },
  );
  return response.data;
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
  const response = await apiClient.get<DevelopmentWorkflowSummary[]>(
    `/development/workflows?${params.toString()}`,
    { signal },
  );
  return response.data;
}

export async function getDevelopmentWorkflow(
  workflowId: string,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowDetail> {
  const response = await apiClient.get<DevelopmentWorkflowDetail>(
    `/development/workflows/${encodeURIComponent(workflowId)}`,
    { signal },
  );
  return response.data;
}
