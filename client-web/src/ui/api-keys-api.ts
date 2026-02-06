/**
 * API Keys Service
 * Handles API key management with Operis API
 */

import { apiRequest } from "./auth-api";

// Types
export interface ApiKey {
  id: string;
  name: string;
  prefix: string; // "sk_" + first 8 chars
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  key: string; // Full key, only shown once
  prefix: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeysListResponse {
  keys: ApiKey[];
  total: number;
}

// List all API keys for current user
export async function listApiKeys(): Promise<ApiKeysListResponse> {
  return apiRequest<ApiKeysListResponse>("/keys");
}

// Create a new API key
export async function createApiKey(
  name: string,
  expiresInDays?: number,
): Promise<ApiKeyCreateResponse> {
  return apiRequest<ApiKeyCreateResponse>("/keys", {
    method: "POST",
    body: JSON.stringify({ name, expiresInDays }),
  });
}

// Update API key (name or active status)
export async function updateApiKey(
  keyId: string,
  updates: { name?: string; isActive?: boolean },
): Promise<ApiKey> {
  return apiRequest<ApiKey>(`/keys/${keyId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// Revoke/delete an API key
export async function revokeApiKey(
  keyId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/keys/${keyId}`, {
    method: "DELETE",
  });
}

// Admin: List all API keys
export async function adminListAllKeys(): Promise<{
  keys: (ApiKey & { userId: string; userEmail: string })[];
  total: number;
}> {
  return apiRequest<{
    keys: (ApiKey & { userId: string; userEmail: string })[];
    total: number;
  }>("/keys/admin/all");
}
