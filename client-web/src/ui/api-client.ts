/**
 * Axios API Client with Auth Interceptors
 * Handles automatic token refresh on 401 errors
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_CONFIG } from "../config";

// Token storage keys
const ACCESS_TOKEN_KEY = "operis_accessToken";
const REFRESH_TOKEN_KEY = "operis_refreshToken";

// Token management functions
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

// Create axios instance
const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Track refresh state — single lock shared by axios interceptor + SSE fetch
let refreshPromise: Promise<string> | null = null;

/**
 * Shared token refresh — ensures only ONE refresh call runs at a time.
 * All callers (axios interceptor, SSE fetch, etc.) share the same promise.
 * Returns the new access token on success.
 */
export async function refreshAccessToken(): Promise<string> {
  // If already refreshing, piggyback on the existing promise
  if (refreshPromise) return refreshPromise;

  const currentRefreshToken = getRefreshToken();
  if (!currentRefreshToken) {
    clearTokens();
    window.dispatchEvent(new CustomEvent("auth:session-expired"));
    throw new Error("No refresh token");
  }

  refreshPromise = axios
    .post(`${API_CONFIG.baseUrl}/auth/refresh`, { refreshToken: currentRefreshToken })
    .then((response) => {
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      setTokens(accessToken, newRefreshToken);
      return accessToken as string;
    })
    .catch((error) => {
      clearTokens();
      window.dispatchEvent(new CustomEvent("auth:session-expired"));
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle 401 via shared refreshAccessToken()
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;

// Helper to get error message from axios error
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    return (
      axiosError.response?.data?.error ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      "Đã xảy ra lỗi"
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Đã xảy ra lỗi";
}
