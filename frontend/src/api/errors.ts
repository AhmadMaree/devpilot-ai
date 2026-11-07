import axios, { type AxiosError } from "axios";

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request could not be processed.",
  401: "Authentication failed. Check the local API configuration.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "The resource changed or is no longer in the expected state.",
  422: "Some request details are invalid.",
  429: "Too many requests. Please try again shortly.",
};

export class ApiError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function safeBackendDetail(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const detail = data.detail;
  if (
    typeof detail !== "string"
    || detail.length === 0
    || detail.length > 240
    || /[\r\n]|\b(traceback|stack trace|exception|sqlite3|internal server error|line \d+)\b|\.py(?::\d+)?/i.test(detail)
    || /(?:[A-Za-z]:\\|\/(?:[^/\s]+\/){1,})/.test(detail)
  ) {
    return null;
  }
  return detail;
}

export function normalizeApiError(error: unknown): Error {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return error;
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new ApiError("An unexpected error occurred.");
  }

  const axiosError = error as AxiosError<unknown>;
  const status = axiosError.response?.status;
  const message = status === undefined
    ? "Unable to connect to DevPilot AI. Check that the local backend is running."
    : status >= 500
      ? "The server could not complete the request. Please try again."
      : safeBackendDetail(axiosError.response?.data)
        ?? STATUS_MESSAGES[status]
        ?? `The request failed (HTTP ${status}).`;

  return new ApiError(message, status);
}
