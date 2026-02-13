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
  gateway_url?: string;
  gateway_token?: string;
}

export interface TunnelInfo {
  tunnelId: string;
  tunnelToken: string;
  domain: string;
  tunnelName: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tunnel?: TunnelInfo | null;
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

// Gateway token storage
const GATEWAY_TOKEN_KEY = "operis_gateway_token";
const GATEWAY_URL_KEY = "operis_gateway_url";

export function getStoredGatewayToken(): string | null {
  return localStorage.getItem(GATEWAY_TOKEN_KEY);
}

export function getStoredGatewayUrl(): string | null {
  return localStorage.getItem(GATEWAY_URL_KEY);
}

function storeGatewayConfig(user: AuthUser): void {
  if (user.gateway_token) {
    localStorage.setItem(GATEWAY_TOKEN_KEY, user.gateway_token);
  }
  if (user.gateway_url) {
    localStorage.setItem(GATEWAY_URL_KEY, user.gateway_url);
  }
}

export function clearGatewayConfig(): void {
  localStorage.removeItem(GATEWAY_TOKEN_KEY);
  localStorage.removeItem(GATEWAY_URL_KEY);
}

// Auth API functions
export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await apiClient.post<AuthResult>("/auth/login", {
    email,
    password,
  });

  // Store tokens and gateway config
  setTokens(response.data.accessToken, response.data.refreshToken);
  storeGatewayConfig(response.data.user);

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

  // Store tokens and gateway config
  setTokens(response.data.accessToken, response.data.refreshToken);
  storeGatewayConfig(response.data.user);

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
  clearGatewayConfig();
}

export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>("/auth/me");
  storeGatewayConfig(response.data);
  return response.data;
}

// Electron IPC bridge type (available when running in Electron)
declare global {
  interface Window {
    electronAPI?: {
      syncAuthProfiles?: (profiles: Record<string, unknown>) => Promise<boolean>;
      clearAuthProfiles?: () => Promise<boolean>;
      provisionTunnel?: (token: string) => Promise<boolean>;
      hasTunnelToken?: () => Promise<boolean>;
      getGatewayConfig?: () => Promise<{ gatewayToken: string; hooksToken: string } | null>;
      [key: string]: unknown;
    };
  }
}

/**
 * Pull auth-profiles from operismb token-vault and sync to local gateway.
 * Called after login/session restore so gateway has valid Anthropic tokens.
 * Only works in Electron (uses IPC to write auth-profiles.json).
 */
export async function pullAndSyncAuthProfiles(): Promise<void> {
  try {
    if (!window.electronAPI?.syncAuthProfiles) return; // Not in Electron

    const response = await apiClient.get<Record<string, unknown>>("/token-vault/auth-profiles");
    const profiles = response.data;
    if (!profiles?.profiles || Object.keys(profiles.profiles as object).length === 0) return;

    await window.electronAPI.syncAuthProfiles(profiles);
  } catch {
    // Non-blocking: log but don't fail login
    console.warn("[auth-api] Failed to pull auth profiles from token vault");
  }
}

/**
 * Clear local auth-profiles.json via Electron IPC (on logout).
 */
export async function clearLocalAuthProfiles(): Promise<void> {
  try {
    if (!window.electronAPI?.clearAuthProfiles) return;
    await window.electronAPI.clearAuthProfiles();
  } catch {
    // Non-blocking
  }
}

/**
 * Start cloudflared with tunnel token and register local gateway config.
 * @param tunnelToken — from login/register response (server already provisioned the tunnel)
 * Called after login/register in Electron. Non-blocking, fire-and-forget.
 */
export async function provisionAndStartTunnel(tunnelToken?: string): Promise<void> {
  try {
    if (!window.electronAPI?.provisionTunnel) return; // Not in Electron

    // Step 1: Start cloudflared with tunnel token
    if (tunnelToken) {
      // Use token from login/register response directly
      await window.electronAPI.provisionTunnel(tunnelToken);
    } else if (window.electronAPI.hasTunnelToken) {
      // Fallback: fetch from API if no token provided (e.g. session restore)
      const hasToken = await window.electronAPI.hasTunnelToken();
      if (!hasToken) {
        const response = await apiClient.post<TunnelInfo>("/tunnels/provision");
        if (response.data.tunnelToken) {
          await window.electronAPI.provisionTunnel(response.data.tunnelToken);
        }
      }
    }

    // Step 2: Register local gateway_token + hooksToken with operismb
    if (window.electronAPI.getGatewayConfig) {
      const gwConfig = await window.electronAPI.getGatewayConfig();
      if (gwConfig?.gatewayToken) {
        await apiClient.patch("/auth/gateway", {
          gateway_token: gwConfig.gatewayToken,
          gateway_hooks_token: gwConfig.hooksToken || undefined,
        });
      }
    }
  } catch {
    console.warn("[auth-api] Tunnel provision/gateway registration failed");
  }
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
