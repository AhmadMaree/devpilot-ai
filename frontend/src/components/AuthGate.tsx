
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  clearAuthState,
  getCurrentSession,
  logout,
  type AuthSession,
} from "../api/auth";

import { LoginPage } from "./LoginPage";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const result = await getCurrentSession();

        if (active) {
          setSession(result);
        }
      } catch {
        clearAuthState();
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setError("");

    try {
      await logout();

      // Remove user-specific cached data.
      queryClient.clear();
      setSession(null);
    } catch {
      setError("Logout failed. Please try again.");
    }
  }

  if (checking) {
    return <main role="status">Checking session...</main>;
  }

  if (!session) {
    return (
      <LoginPage
        onLogin={(nextSession) => {
          queryClient.clear();
          setSession(nextSession);
        }}
      />
    );
  }

  return (
    <>
      <div className="auth-toolbar">
        <span>DevPilot AI · Signed in</span>

        <button type="button" onClick={() => void handleLogout()}>
          Log out
        </button>

        {error && <p role="alert">{error}</p>}
      </div>

      {children}
    </>
  );
}
