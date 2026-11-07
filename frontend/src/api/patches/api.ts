import { apiClient } from "../client";
import { ApiError } from "../errors";
import type {
  PatchProposalDetails,
  PatchProposalSummary,
  PatchPreview,
  PatchActionResponse,
  GeneratePatchRequest,
  GeneratedPatchResponse,
} from "./types";

export class PatchApiError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "PatchApiError";
  }
}

async function request<T>(
  path: string,
  signal?: AbortSignal,
  method: "get" | "post" = "get",
  payload?: unknown,
  timeout?: number,
): Promise<T> {
  try {
    const response = method === "get"
      ? await apiClient.get<T>(path, { signal, timeout })
      : await apiClient.post<T>(path, payload, { signal, timeout });
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw new PatchApiError(error.message, error.status ?? 0);
    }
    throw error;
  }
}

export function getPatchProposals(
  repositoryId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<PatchProposalSummary[]> {
  return request<PatchProposalSummary[]>(
    `/patches/proposals?${new URLSearchParams({
      repository_id: repositoryId,
      limit: "50",
      offset: String(offset),
    })}`,
    signal,
  );
}

export function getPatchPreview(
  proposalId: string,
  signal?: AbortSignal,
): Promise<PatchPreview> {
  return request<PatchPreview>(
    `/patches/proposals/${encodeURIComponent(proposalId)}/preview`,
    signal,
  );
}

export function getPatchProposalDetails(
  proposalId: string,
  signal?: AbortSignal,
): Promise<PatchProposalDetails> {
  return request<PatchProposalDetails>(
    `/patches/proposals/${encodeURIComponent(proposalId)}`,
    signal,
  );
}

export function approvePatch(
  proposalId: string,
  signal?: AbortSignal,
): Promise<PatchActionResponse> {
  return request<PatchActionResponse>(
    `/patches/proposals/${encodeURIComponent(proposalId)}/approve`,
    signal,
    "post",
  );
}

export function rejectPatch(
  proposalId: string,
  signal?: AbortSignal,
): Promise<PatchActionResponse> {
  return request<PatchActionResponse>(
    `/patches/proposals/${encodeURIComponent(proposalId)}/reject`,
    signal,
    "post",
  );
}

export function generatePatchProposal(
  payload: GeneratePatchRequest,
  signal?: AbortSignal,
): Promise<GeneratedPatchResponse> {
  return request<GeneratedPatchResponse>(
    "/patches/generate",
    signal,
    "post",
    payload,
    180_000,
  );
}
