import { apiClient } from "./client";
import type {
  HealthResponse,
  InvestigationRequest,
  InvestigationSummary,
  SavedInvestigation,
} from "./types";
import { healthUrl } from "./config";

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>(healthUrl(), {
    signal,
    timeout: 5_000,
  });
  return response.data;
}

export async function get_investigation(
  request: InvestigationRequest,
  signal?: AbortSignal,
): Promise<SavedInvestigation> {
  const response = await apiClient.post<SavedInvestigation>(
    "/agents/investigate",
    request,
    { signal, timeout: 180_000 },
  );
  return response.data;
}

export async function getInvestigationHistory(
  signal?: AbortSignal,
): Promise<InvestigationSummary[]> {
  const response = await apiClient.get<InvestigationSummary[]>(
    "/agents/investigations",
    { signal },
  );
  return response.data;
}

export async function getSavedInvestigation(
  id: string,
  signal?: AbortSignal,
): Promise<SavedInvestigation> {
  const response = await apiClient.get<SavedInvestigation>(
    `/agents/investigations/${encodeURIComponent(id)}`,
    { signal },
  );
  return response.data;
}
