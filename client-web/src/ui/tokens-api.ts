/**
 * Tokens API Service
 * Handles token balance and transactions with Operis API
 */

import { apiRequest } from "./auth-api";

// Types
export interface TokenBalance {
  balance: number;
  userId: string;
}

export interface TokenTransaction {
  id: string;
  userId: string;
  amount: number;
  type: "credit" | "debit" | "usage" | "refund" | "adjustment";
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface TransactionsResponse {
  transactions: TokenTransaction[];
  total: number;
  page: number;
  limit: number;
}

// Get current token balance
export async function getTokenBalance(): Promise<TokenBalance> {
  return apiRequest<TokenBalance>("/tokens/balance");
}

// Get transaction history
export async function getTransactions(
  page = 1,
  limit = 20,
): Promise<TransactionsResponse> {
  return apiRequest<TransactionsResponse>(
    `/tokens/transactions?page=${page}&limit=${limit}`,
  );
}

// Admin: Credit tokens to user
export async function adminCreditTokens(
  userId: string,
  amount: number,
  description: string,
): Promise<{ success: boolean; newBalance: number }> {
  return apiRequest<{ success: boolean; newBalance: number }>(
    "/tokens/admin/credit",
    {
      method: "POST",
      body: JSON.stringify({ userId, amount, description }),
    },
  );
}

// Admin: Debit tokens from user
export async function adminDebitTokens(
  userId: string,
  amount: number,
  description: string,
): Promise<{ success: boolean; newBalance: number }> {
  return apiRequest<{ success: boolean; newBalance: number }>(
    "/tokens/admin/debit",
    {
      method: "POST",
      body: JSON.stringify({ userId, amount, description }),
    },
  );
}

// Admin: Set exact balance
export async function adminAdjustTokens(
  userId: string,
  newBalance: number,
  description: string,
): Promise<{ success: boolean; newBalance: number }> {
  return apiRequest<{ success: boolean; newBalance: number }>(
    "/tokens/admin/adjust",
    {
      method: "POST",
      body: JSON.stringify({ userId, newBalance, description }),
    },
  );
}
