/**
 * Axios API Client with HttpOnly Cookie Auth
 * Cookies are sent automatically via withCredentials — no localStorage token storage.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_CONFIG } from "../config";

// Create axios instance — cookies sent automatically via withCredentials
const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Track refresh state — single lock shared by axios interceptor + SSE fetch
let refreshPromise: Promise<void> | null = null;

/**
 * Shared token refresh — ensures only ONE refresh call runs at a time.
 * Server reads refresh cookie automatically and sets new cookies via Set-Cookie.
 */
export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post(`${API_CONFIG.baseUrl}/auth/refresh`, {}, { withCredentials: true })
    .then(() => {
      // Server set new HttpOnly cookies — nothing to store client-side
    })
    .catch((error) => {
      window.dispatchEvent(new CustomEvent("auth:session-expired"));
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Response interceptor — handle 401 via shared refreshAccessToken()
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Skip refresh for auth endpoints (login/register already return proper errors)
    const url = originalRequest?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        await refreshAccessToken();
        // Retry original request — cookie is now refreshed
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
