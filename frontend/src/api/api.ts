
import type {
    HealthResponse,
    InvestigationRequest,
    InvestigationResponse,
    InvestigationSummary,
    SavedInvestigation,
} from "./types"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const getHealth = async(): Promise<HealthResponse> => {
    const response = await fetch(
        `${API_BASE_URL}/health`
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
        `${API_BASE_URL}/api/v1/agents/investigate`,
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


export const getInvestigationHistory= async():  Promise<InvestigationSummary[]> => {
    const response = await fetch(
        `${API_BASE_URL}/api/v1/agents/investigations`,
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
        `${API_BASE_URL}/api/v1/agents/investigations/${encodeURIComponent(id)}`,
    );

    if (!response.ok) {
        throw new Error(
        `Failed to load investigation (${response.status})`,
        );
    }

    return (await response.json()) as SavedInvestigation;
}
