
import axios from "axios";

import { apiBaseUrl } from "./config";
import { normalizeApiError } from "./errors";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl(),
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toUpperCase();

  if (
    csrfToken &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    config.headers.set("X-CSRF-Token", csrfToken);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error)),
);
