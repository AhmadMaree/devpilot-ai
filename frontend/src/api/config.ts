const PRODUCTION_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function apiBaseUrl(): string {
  return import.meta.env.DEV
    ? "/api/v1"
    : `${PRODUCTION_API_BASE_URL.replace(/\/+$/, "")}/api/v1`;
}

export function healthUrl(): string {
  return import.meta.env.DEV
    ? "http://127.0.0.1:8000/health"
    : `${PRODUCTION_API_BASE_URL.replace(/\/+$/, "")}/health`;
}
