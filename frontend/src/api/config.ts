const PRODUCTION_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export function apiUrl(path: string): string {
  return import.meta.env.DEV
    ? path
    : `${PRODUCTION_API_BASE_URL}${path}`;
}

export function healthUrl(): string {
  return import.meta.env.DEV
    ? "http://127.0.0.1:8000/health"
    : apiUrl("/health");
}
