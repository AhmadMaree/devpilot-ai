
import type { HealthResponse } from "./types"

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