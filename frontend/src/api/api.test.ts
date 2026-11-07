import { afterEach, describe, expect, it } from "vitest";
import { AxiosHeaders } from "axios";
import type { AxiosAdapter } from "axios";

import { apiClient } from "./client";
import { normalizeApiError, ApiError } from "./errors";
import { queryKeys } from "./queryKeys";
import { getRepositories } from "./repositories";

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe("shared API client", () => {
  it("uses a single configured relative API base URL", () => {
    expect(apiClient.defaults.baseURL).toBe("/api/v1");
    expect(apiClient.defaults.timeout).toBe(15_000);
  });

  it("returns typed repository arrays and forwards query cancellation", async () => {
    const repositories = [{
      id: "repo-1",
      name: "Example",
      path: "D:\\Projects\\example",
      created_at: "2026-01-01T00:00:00Z",
    }];
    const controller = new AbortController();
    let requestUrl = "";
    let requestSignalForwarded = false;

    const adapter: AxiosAdapter = async (config) => {
      requestUrl = config.url ?? "";
      requestSignalForwarded = config.signal === controller.signal;
      return {
        data: repositories,
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      };
    };
    apiClient.defaults.adapter = adapter;

    await expect(getRepositories(controller.signal)).resolves.toEqual(repositories);
    expect(requestUrl).toBe("/repositories");
    expect(requestSignalForwarded).toBe(true);
  });
});

describe("API error normalization", () => {
  it("preserves safe conflict details and status codes", () => {
    const error = normalizeApiError({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "File changed since proposal creation." },
      },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("File changed since proposal creation.");
    expect((error as ApiError).status).toBe(409);
  });

  it("provides a useful authentication message for 401 responses", () => {
    const error = normalizeApiError({
      isAxiosError: true,
      response: { status: 401, data: {} },
    });

    expect(error.message).toContain("Authentication failed");
    expect((error as ApiError).status).toBe(401);
  });

  it("does not expose server tracebacks", () => {
    const error = normalizeApiError({
      isAxiosError: true,
      response: {
        status: 500,
        data: { detail: "Traceback (most recent call last): secret internal detail" },
      },
    });

    expect(error.message).toBe("The server could not complete the request. Please try again.");
    expect(error.message).not.toContain("Traceback");
  });
});

describe("query key isolation", () => {
  it("separates repository-scoped proposal and workflow pages", () => {
    expect(queryKeys.proposals.page("repo-a", 0))
      .not.toEqual(queryKeys.proposals.page("repo-b", 0));
    expect(queryKeys.workflows.byRepository("repo-a"))
      .not.toEqual(queryKeys.workflows.byRepository("repo-b"));
  });
});
