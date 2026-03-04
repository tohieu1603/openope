// API Configuration
export const API_CONFIG = {
  // Gateway URL - in dev, Vite proxies /api to avoid CORS
  // In production, use VITE_API_BASE_URL or default
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  token: import.meta.env.VITE_GATEWAY_TOKEN || "",
};
