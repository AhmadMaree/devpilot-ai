import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";
import { useHashNavigation } from "../hooks/useHashNavigation";

function NavigationHarness() {
  const destination = useHashNavigation();

  return (
    <AppShell
      destination={destination}
      repositoryName="Example repository"
      modelLabel="ollama · qwen3:4b"
      onLogout={() => undefined}
      logoutError=""
      loggingOut={false}
    >
      <p data-testid="destination-content">{destination}</p>
    </AppShell>
  );
}

describe("application navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the current destination and repository name", () => {
    window.history.replaceState(null, "", "/#settings");
    render(<NavigationHarness />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByTestId("destination-content")).toHaveTextContent("settings");
    expect(screen.getByText("Example repository")).toBeVisible();
    expect(screen.getByLabelText("Selected model: ollama · qwen3:4b")).toBeVisible();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("updates the active destination when a navigation link is selected", async () => {
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole("link", { name: "Repositories" }));

    await waitFor(() => {
      expect(window.location.hash).toBe("#repositories");
      expect(screen.getByTestId("destination-content")).toHaveTextContent("repositories");
    });
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("follows browser back and forward navigation", async () => {
    render(<NavigationHarness />);
    fireEvent.click(screen.getByRole("link", { name: "Repositories" }));
    await screen.findByText("repositories");

    act(() => {
      window.history.back();
    });
    await waitFor(() => {
      expect(screen.getByTestId("destination-content")).toHaveTextContent("dashboard");
    });

    act(() => {
      window.history.forward();
    });
    await waitFor(() => {
      expect(screen.getByTestId("destination-content")).toHaveTextContent("repositories");
    });
  });

  it("supports opening and dismissing mobile navigation", async () => {
    render(<NavigationHarness />);

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("link", { name: "AI Workspace" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#ai-workspace");
    });
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
