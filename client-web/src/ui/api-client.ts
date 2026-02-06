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

// Track refresh state to avoid multiple concurrent refresh calls
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

// Subscribe to token refresh
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Notify all subscribers with new token
function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
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

// Response interceptor - handle 401 and refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = getRefreshToken();

      // No refresh token available - clear and reject
      if (!refreshToken) {
        clearTokens();
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
        return Promise.reject(error);
      }

      // If already refreshing, wait for it to complete
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call refresh endpoint directly (don't use apiClient to avoid infinite loop)
        const response = await axios.post(`${API_CONFIG.baseUrl}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        setTokens(accessToken, newRefreshToken);

        // Notify all waiting requests
        onTokenRefreshed(accessToken);
        isRefreshing = false;

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and notify
        isRefreshing = false;
        refreshSubscribers = [];
        clearTokens();
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
        return Promise.reject(refreshError);
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
