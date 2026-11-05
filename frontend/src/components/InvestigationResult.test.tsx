import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InvestigationResponse } from "../api/types";
import { InvestigationResult } from "./InvestigationResult";

const sourceOne = {
  source_id: "S1",
  chunk_id: "chunk-auth",
  file_path: "src/auth.ts",
  start_line: 12,
  end_line: 14,
  commit_sha: "1234567890abcdef",
};

const sourceTwo = {
  source_id: "S2",
  chunk_id: "chunk-user",
  file_path: "src/user.ts",
  start_line: 40,
  end_line: 42,
  commit_sha: "abcdef1234567890",
};

const result: InvestigationResponse = {
  repository_id: "repo-1",
  question: "Where is authentication handled?",
  plan: "Find the authentication implementation.",
  answer: "Authentication is handled here [S1], with user context [S2].",
  review_passed: true,
  review_feedback: "Citation labels refer to retrieved evidence.",
  attempts: 2,
  sources: [sourceOne, sourceTwo],
};

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("investigation result", () => {
  it("renders answer citations and an accurate citation-check status", () => {
    render(<InvestigationResult result={result} />);

    expect(document.querySelector(".answer-text")).toHaveTextContent(
      "Authentication is handled here [S1], with user context [S2].",
    );
    expect(screen.getByRole("button", { name: "Go to source [S1], src/auth.ts" }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Go to source [S2], src/user.ts" }))
      .toBeVisible();
    expect(screen.getAllByText("Citation check passed")).toHaveLength(2);
    expect(screen.getByText("Answer attempts: 2")).toBeVisible();
    expect(screen.queryByText("Review passed")).not.toBeInTheDocument();
  });

  it("selects, scrolls to, and expands the source matching a citation", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(<InvestigationResult result={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Go to source [S2], src/user.ts" }));

    const selectedCard = screen.getByRole("article", { name: "[S2] src/user.ts" });
    expect(selectedCard).toHaveClass("source-card-selected");
    expect(within(selectedCard).getByRole("button", { name: /Collapse/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("expands and collapses each source card independently", () => {
    render(<InvestigationResult result={result} />);
    const sourceCard = screen.getByRole("article", { name: "[S1] src/auth.ts" });
    const expand = within(sourceCard).getByRole("button", { name: /Expand/ });

    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(within(sourceCard).getByText(/Source text is not included/)).toBeVisible();

    fireEvent.click(within(sourceCard).getByRole("button", { name: /Collapse/ }));
    expect(within(sourceCard).getByRole("button", { name: /Expand/ }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("copies and line-numbers a returned source snippet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const resultWithSnippet: InvestigationResponse = {
      ...result,
      sources: [{
        ...sourceOne,
        source_text: "function authenticate() {\n  return true;\n}",
      }],
    };
    render(<InvestigationResult result={resultWithSnippet} />);
    const card = screen.getByRole("article", { name: "[S1] src/auth.ts" });
    fireEvent.click(within(card).getByRole("button", { name: /Expand/ }));

    expect(within(card).getByText("12")).toBeVisible();
    expect(within(card).getByText("13")).toBeVisible();
    expect(within(card).getByText("function authenticate() {")).toBeVisible();
    fireEvent.click(within(card).getByRole("button", { name: "Copy snippet" }));

    expect(writeText).toHaveBeenCalledWith("function authenticate() {\n  return true;\n}");
    expect(await screen.findByText("Source snippet copied.")).toBeVisible();
  });

  it("shows a clear unavailable state and no copy action when source text is missing", () => {
    render(<InvestigationResult result={result} />);
    const card = screen.getByRole("article", { name: "[S1] src/auth.ts" });
    fireEvent.click(within(card).getByRole("button", { name: /Expand/ }));

    expect(within(card).getByText(/Source text is not included in the investigation response/))
      .toBeVisible();
    expect(within(card).queryByRole("button", { name: "Copy snippet" }))
      .not.toBeInTheDocument();
  });

  it("keeps unknown citations as text without inventing evidence", () => {
    render(
      <InvestigationResult
        result={{ ...result, answer: "This source is unavailable [S5]." }}
      />,
    );

    expect(document.querySelector(".answer-text")).toHaveTextContent(
      "This source is unavailable [S5].",
    );
    expect(screen.queryByRole("button", { name: /S5/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("supports multiple and repeated references to the same source", () => {
    render(
      <InvestigationResult
        result={{ ...result, answer: "First [S1], next [S2], and again [S1]." }}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Go to source [S1], src/auth.ts" }))
      .toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Go to source [S1], src/auth.ts" })[1]);
    expect(screen.getByRole("article", { name: "[S1] src/auth.ts" }))
      .toHaveClass("source-card-selected");
  });

  it("makes each known label in a grouped citation clickable", () => {
    const thirdSource = {
      source_id: "S3",
      chunk_id: "chunk-patch",
      file_path: "backend/app/patches/service.py",
      start_line: 8,
      end_line: 14,
      commit_sha: "fedcba9876543210",
    };
    render(
      <InvestigationResult
        result={{
          ...result,
          answer: "Repository patches are implemented here [S1, S2, S3].",
          sources: [...result.sources!, thirdSource],
        }}
      />,
    );

    expect(document.querySelector(".answer-text")?.textContent)
      .toBe("Repository patches are implemented here [S1], [S2], [S3].");
    expect(screen.getByRole("button", { name: "Go to source [S1], src/auth.ts" }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Go to source [S2], src/user.ts" }))
      .toBeVisible();
    const thirdCitation = screen.getByRole("button", {
      name: "Go to source [S3], backend/app/patches/service.py",
    });
    fireEvent.click(thirdCitation);
    expect(screen.getByRole("article", {
      name: "[S3] backend/app/patches/service.py",
    })).toHaveClass("source-card-selected");
  });

  it("renders answer text literally without interpreting HTML", () => {
    render(
      <InvestigationResult
        result={{ ...result, answer: "<img src=x onerror=alert(1)> [S1]" }}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to source [S1], src/auth.ts" }))
      .toBeVisible();
  });

  it("preserves line breaks and whitespace around citation controls", () => {
    render(
      <InvestigationResult
        result={{ ...result, answer: "First line.\n  Indented line [S1].\nLast line." }}
      />,
    );

    expect(document.querySelector(".answer-text")?.textContent)
      .toBe("First line.\n  Indented line [S1].\nLast line.");
    expect(screen.getByRole("button", { name: "Go to source [S1], src/auth.ts" }))
      .toBeVisible();
  });

  it("shows workflow responsibilities, available outputs, and citation-only review semantics", () => {
    render(<InvestigationResult result={result} />);

    expect(screen.getByRole("heading", { name: "Agent execution" })).toBeVisible();
    expect(screen.getByText("Understands the question and prepares an investigation plan."))
      .toBeVisible();
    expect(screen.getByText("Finds relevant source-code evidence.")).toBeVisible();
    expect(screen.getByText("Produces an answer using retrieved evidence.")).toBeVisible();
    expect(screen.getByText("Checks that citation labels refer to retrieved evidence."))
      .toBeVisible();
    expect(screen.getByText(/The Reviewer checks citation labels against retrieved sources; it does not verify factual correctness\./))
      .toBeVisible();
    fireEvent.click(screen.getAllByText("Available details")[0]);
    expect(screen.getByText("Find the authentication implementation."))
      .toBeVisible();
  });

  it("handles historical results with missing agent metadata", () => {
    const olderResult: InvestigationResponse = {
      repository_id: "repo-1",
      sources: [{
        file_path: "legacy.py",
        start_line: 1,
        end_line: 2,
        commit_sha: "legacy-commit",
      }],
    };
    render(<InvestigationResult result={olderResult} />);

    expect(screen.getAllByText("Citation check status unavailable")).toHaveLength(2);
    expect(screen.queryByText("File path unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("legacy.py")).toBeVisible();
    expect(screen.queryByText(/Answer attempts/)).not.toBeInTheDocument();
    expect(screen.getByText("No plan details returned")).toBeVisible();
    expect(screen.getByText("No answer returned")).toBeVisible();
    const sourceCard = screen.getByRole("article", { name: "Source legacy.py" });
    fireEvent.click(within(sourceCard).getByRole("button", { name: /Expand/ }));
    expect(within(sourceCard).getByText(/Source text is not included/)).toBeVisible();
  });

  it("keeps citation controls keyboard accessible", () => {
    render(<InvestigationResult result={result} />);

    const citation = screen.getByRole("button", { name: "Go to source [S1], src/auth.ts" });
    expect(citation.tagName).toBe("BUTTON");
    expect(citation).not.toHaveAttribute("tabindex", "-1");
    expect(within(screen.getByRole("article", { name: "[S1] src/auth.ts" }))
      .getByRole("button", { name: /Expand/ })).toHaveAttribute("aria-expanded", "false");
  });
});
