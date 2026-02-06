/**
 * User API Service
 * Handles user profile and account operations
 */

import { apiRequest } from "./auth-api";

// Types
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  tokenBalance: number;
  createdAt: string;
  role?: string;
}

// Get user profile
export async function getUserProfile(): Promise<UserProfile> {
  // API returns user directly, not wrapped in {user: ...}
  const data = await apiRequest<{
    id: string;
    email: string;
    name: string;
    token_balance: number;
    created_at: string;
    role?: string;
  }>("/auth/me");

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    tokenBalance: data.token_balance,
    createdAt: data.created_at,
    role: data.role,
  };
}

// Update user profile
export async function updateUserProfile(data: { name: string }): Promise<UserProfile> {
  const result = await apiRequest<{
    user: {
      id: string;
      email: string;
      name: string;
      token_balance: number;
      created_at: string;
      role?: string;
    };
  }>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    tokenBalance: result.user.token_balance,
    createdAt: result.user.created_at,
    role: result.user.role,
  };
}

// Change password
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
  return apiRequest("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
