import { useEffect, useState, type ReactNode } from "react";

import type { Destination } from "../hooks/useHashNavigation";
import styles from "./AppShell.module.scss";

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
    <div className={styles["app-shell"]}>
      <a className={styles["skip-link"]} href="#main-content">
        Skip to content
      </a>

      {mobileNavigationOpen && (
        <button
          type="button"
          className={styles["sidebar-backdrop"]}
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}

      <aside
        className={`${styles.sidebar}${mobileNavigationOpen ? ` ${styles["sidebar-open"]}` : ""}`}
        aria-label="Application sidebar"
      >
        <a className={styles.brand} href="#dashboard" aria-label="DevPilot AI dashboard">
          <span className={styles["brand-icon"]} aria-hidden="true">D</span>
          <span>
            <strong>DevPilot AI</strong>
            <small>Local developer workspace</small>
          </span>
        </a>

        <div className={styles["sidebar-workspace"]}>
          <span className={styles["sidebar-label"]}>ACTIVE REPOSITORY</span>
          <div className={styles["repository-item"]}>
            <span className={styles["repository-mark"]} aria-hidden="true">⌘</span>
            <span className={styles["repository-name"]}>
              {repositoryName || "No repository selected"}
            </span>
          </div>
        </div>

        <nav
          id="primary-navigation"
          className={styles["primary-nav"]}
          aria-label="Main navigation"
        >
          <span className={styles["sidebar-label"]}>WORKSPACE</span>
          {navigationItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`${styles["nav-link"]}${destination === item.id ? ` ${styles["nav-link-active"]}` : ""}`}
              aria-current={destination === item.id ? "page" : undefined}
              onClick={() => setMobileNavigationOpen(false)}
            >
              <span
                className={`${styles["nav-icon"]} ${styles[`nav-icon-${item.id}`]}`}
                aria-hidden="true"
              />
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles["sidebar-footer"]}>
          <span className={styles["local-indicator"]} aria-hidden="true" />
          <span>Local development</span>
        </div>
      </aside>

      <div className={styles["app-main"]}>
        <header className={styles["app-header"]}>
          <button
            type="button"
            className={styles["mobile-nav-toggle"]}
            aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavigationOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true">{mobileNavigationOpen ? "×" : "☰"}</span>
          </button>
          <div className={styles["page-heading"]}>
            <p className={styles.eyebrow}>DEVPILOT WORKSPACE</p>
            <h1>{page.title}</h1>
            <p className={styles["page-description"]}>{page.description}</p>
          </div>
          {modelLabel && (
            <div className={styles["model-badge"]} aria-label={`Selected model: ${modelLabel}`}>
              <span className={styles["model-status-dot"]} aria-hidden="true" />
              {modelLabel}
            </div>
          )}
        </header>

        <main id="main-content" className={styles["main-content"]} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
