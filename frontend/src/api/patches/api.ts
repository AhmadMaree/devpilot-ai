
import type {
    PatchPreview,
    PatchActionResponse,
    GeneratePatchRequest,
    GeneratedPatchResponse
} from "./types"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000";


const request = async <T>(
    path: string,
    options?: RequestInit,
): Promise<T> => {
    const response = await fetch(
        `${API_BASE_URL}${path}`,
        options,
    );

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const body = await response.json();

            if (typeof body.detail === "string") {
                detail = body.detail;
            }
        } catch {
        // Keep the HTTP status as the fallback.
        }

        throw new Error(detail);
    }

    return response.json() as Promise<T>;
}


export const getPatchPreview = (proposalId: string,): Promise<PatchPreview> => {
    return request<PatchPreview>(
        `/api/v1/patches/proposals/${encodeURIComponent(proposalId)}/preview`,
    );
}

export const approvePatch = (proposalId: string,): Promise<PatchActionResponse> => {
    return request<PatchActionResponse>(
        `/api/v1/patches/proposals/${encodeURIComponent(proposalId)}/approve`,
        {method: "POST"}
    );
}


export const rejectPatch = (proposalId: string,): Promise<PatchActionResponse> => {
    return request<PatchActionResponse>(
        `/api/v1/patches/proposals/${encodeURIComponent(proposalId)}/reject`,
        {method: "POST"}
    );
}

export const generatePatchProposal = (payload: GeneratePatchRequest) => {
    return request<GeneratedPatchResponse>(
        "/api/v1/patches/generate",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
        }
    )
}
