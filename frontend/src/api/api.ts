
import type {
    HealthResponse,
    InvestigationRequest,
    InvestigationSummary,
    SavedInvestigation,
} from "./types"
import { apiUrl, healthUrl } from "./config";

export const getHealth = async(): Promise<HealthResponse> => {
    const response = await fetch(
        healthUrl()
    );

    if(!response.ok) {
        throw new Error(`Health check failed with status: ${response.status}`)
    }

    return (await(response.json())) as HealthResponse
}

export const get_investigation = async(
    request: InvestigationRequest,
    signal: AbortSignal
): Promise<SavedInvestigation> =>
{
    const response = await fetch(
        apiUrl("/api/v1/agents/investigate"),
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
        let message = `Request failed (${response.status})`;

        try {
        const error: unknown = await response.json();

        if (
            typeof error === "object" &&
            error !== null &&
            "detail" in error &&
            typeof error.detail === "string"
        ) {
            message = error.detail;
        }
        } catch {
        // Preserve the HTTP error if the body is not JSON.
        }
        throw new Error(message);
    }

    return (await response.json()) as SavedInvestigation;
}


export const getInvestigationHistory = async(
  signal?: AbortSignal,
): Promise<InvestigationSummary[]> => {
    const response = await fetch(
        apiUrl("/api/v1/agents/investigations"),
        { signal },
    );

    if (!response.ok) {
        throw new Error(
        `Failed to load history (${response.status})`,
        );
    }

    return (await response.json()) as InvestigationSummary[];
}


export const getSavedInvestigation = async(
  id: string,
): Promise<SavedInvestigation> => {
    const response = await fetch(
        apiUrl(`/api/v1/agents/investigations/${encodeURIComponent(id)}`),
    );

    if (!response.ok) {
        throw new Error(
        `Failed to load investigation (${response.status})`,
        );
    }

    return (await response.json()) as SavedInvestigation;
}
