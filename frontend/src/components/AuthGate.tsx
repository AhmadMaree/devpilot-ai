
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
  children: (actions: {
    onLogout: () => void;
    logoutError: string;
    loggingOut: boolean;
  }) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

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
    if (loggingOut) return;
    setError("");
    setLoggingOut(true);

    try {
      await logout();

      // Remove user-specific cached data.
      queryClient.clear();
      setSession(null);
    } catch {
      setError("Logout failed. Please try again.");
    } finally {
      setLoggingOut(false);
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

  return children({
    onLogout: () => void handleLogout(),
    logoutError: error,
    loggingOut,
  });
}
