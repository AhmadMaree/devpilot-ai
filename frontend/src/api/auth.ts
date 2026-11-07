
import { apiClient, setCsrfToken } from "./client";

export interface AuthSession {
  authenticated: boolean;
  csrf_token: string;
  expires_at: number;
}

export async function getCurrentSession(): Promise<AuthSession> {
  const { data } = await apiClient.get<AuthSession>(
    "/auth/me",
  );

  setCsrfToken(data.csrf_token);
  return data;
}

export async function login(
  password: string,
): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>(
    "/auth/login",
    { password },
  );

  setCsrfToken(data.csrf_token);
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
  setCsrfToken(null);
}

export function clearAuthState(): void {
  setCsrfToken(null);
}
