import type {
  DevelopmentWorkflowRequest,
  DevelopmentWorkflowResponse,
} from "./types";


export async function runDevelopmentWorkflow(
  request: DevelopmentWorkflowRequest,
  signal?: AbortSignal,
): Promise<DevelopmentWorkflowResponse> {
  const response = await fetch(
    "/api/v1/development/workflows",
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
    let message = `Workflow request failed (${response.status})`;

    try {
      const body: unknown = await response.json();

      if (
        typeof body === "object" &&
        body !== null &&
        "detail" in body
      ) {
        const detail = body.detail;
        if (typeof detail === "string") {
          message = detail;
        }
      }
    } catch {
      // Preserve the HTTP status message.
    }

    throw new Error(message);
  }

  return (await response.json()) as DevelopmentWorkflowResponse;
}
