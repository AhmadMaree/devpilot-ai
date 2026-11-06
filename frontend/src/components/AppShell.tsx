import { useEffect, useState, type ReactNode } from "react";

import type { Destination } from "../hooks/useHashNavigation";

const navigationItems: Array<{ id: Destination; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "repositories", label: "Repositories" },
  { id: "ai-workspace", label: "AI Workspace" },
  { id: "review-center", label: "Review Center" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

const pageDetails: Record<Destination, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard",
    description: "Your local workspace for understanding and improving code.",
  },
  repositories: {
    title: "Repositories",
    description: "Connect a repository and prepare it for AI-assisted work.",
  },
  "ai-workspace": {
    title: "AI Workspace",
    description: "Ask questions about your code or request a reviewed change.",
  },
  "review-center": {
    title: "Review Center",
    description: "Inspect proposed changes before deciding what to do.",
  },
  activity: {
    title: "Activity",
    description: "Everything your AI assistant has worked on",
  },
  settings: {
    title: "Settings",
    description: "Choose the AI provider and model used by DevPilot.",
  },
};

interface AppShellProps {
  destination: Destination;
  repositoryName: string | null;
  modelLabel: string | null;
  children: ReactNode;
}

export function AppShell({
  destination,
  repositoryName,
  modelLabel,
  children,
}: AppShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const page = pageDetails[destination];

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {mobileNavigationOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}

      <aside
        className={`sidebar${mobileNavigationOpen ? " sidebar-open" : ""}`}
        aria-label="Application sidebar"
      >
        <a className="brand" href="#dashboard" aria-label="DevPilot AI dashboard">
          <span className="brand-icon" aria-hidden="true">D</span>
          <span>
            <strong>DevPilot AI</strong>
            <small>Local developer workspace</small>
          </span>
        </a>

        <div className="sidebar-workspace">
          <span className="sidebar-label">ACTIVE REPOSITORY</span>
          <div className="repository-item">
            <span className="repository-mark" aria-hidden="true">⌘</span>
            <span className="repository-name">
              {repositoryName || "No repository selected"}
            </span>
          </div>
        </div>

        <nav
          id="primary-navigation"
          className="primary-nav"
          aria-label="Main navigation"
        >
          <span className="sidebar-label">WORKSPACE</span>
          {navigationItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-link${destination === item.id ? " nav-link-active" : ""}`}
              aria-current={destination === item.id ? "page" : undefined}
              onClick={() => setMobileNavigationOpen(false)}
            >
              <span className={`nav-icon nav-icon-${item.id}`} aria-hidden="true" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="local-indicator" aria-hidden="true" />
          <span>Local development</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavigationOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true">{mobileNavigationOpen ? "×" : "☰"}</span>
          </button>
          <div className="page-heading">
            <p className="eyebrow">DEVPILOT WORKSPACE</p>
            <h1>{page.title}</h1>
            <p className="page-description">{page.description}</p>
          </div>
          {modelLabel && (
            <div className="model-badge" aria-label={`Selected model: ${modelLabel}`}>
              <span className="model-status-dot" aria-hidden="true" />
              {modelLabel}
            </div>
          )}
        </header>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
