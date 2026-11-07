import axios from "axios";

import { apiBaseUrl } from "./config";
import { normalizeApiError } from "./errors";

export const apiClient = axios.create({
  baseURL: apiBaseUrl(),
  timeout: 15_000,
  headers: {
    Accept: "application/json",
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error)),
);
