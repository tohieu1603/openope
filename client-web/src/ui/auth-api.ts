/**
 * Auth API Service
 * Handles authentication with Operis API
 */

import apiClient, {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  isAuthenticated,
  getErrorMessage,
} from "./api-client";

// Re-export token functions for backward compatibility
export {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  isAuthenticated,
};

// Types
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  token_balance: number;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthError {
  error: string;
  code?: string;
}

// Shared API request helper using axios client
export async function apiRequest<T>(
  endpoint: string,
  options: { method?: string; body?: string } = {},
): Promise<T> {
  try {
    const response = await apiClient.request<T>({
      url: endpoint,
      method: (options.method as "GET" | "POST" | "PUT" | "DELETE") || "GET",
      data: options.body ? JSON.parse(options.body) : undefined,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Auth API functions
export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await apiClient.post<AuthResult>("/auth/login", {
    email,
    password,
  });

  // Store tokens
  setTokens(response.data.accessToken, response.data.refreshToken);

  return response.data;
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<AuthResult> {
  const response = await apiClient.post<AuthResult>("/auth/register", {
    email,
    password,
    name,
  });

  // Store tokens
  setTokens(response.data.accessToken, response.data.refreshToken);

  return response.data;
}

export async function refreshTokens(): Promise<AuthResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Use axios directly to avoid interceptor loop
  const { default: axios } = await import("axios");
  const { API_CONFIG } = await import("../config");

  const response = await axios.post<AuthResult>(`${API_CONFIG.baseUrl}/auth/refresh`, {
    refreshToken,
  });

  setTokens(response.data.accessToken, response.data.refreshToken);
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    // Ignore logout errors - just clear tokens
  }
  clearTokens();
}

export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>("/auth/me");
  return response.data;
}

// Try to restore session from stored tokens
export async function restoreSession(): Promise<AuthUser | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    return await getMe();
  } catch {
    // Token invalid, try to refresh
    try {
      const result = await refreshTokens();
      return result.user;
    } catch {
      // Refresh failed, clear tokens
      clearTokens();
      return null;
    }
  }
}
