/**
 * Deposits API Service
 * Handles payment and deposit operations with Operis API
 *
 * Endpoints:
 * - GET /deposits/pricing - Bảng giá token
 * - POST /deposits - Tạo đơn nạp tiền
 * - GET /deposits/pending - Đơn nạp đang chờ
 * - DELETE /deposits/{id} - Hủy đơn nạp
 * - GET /deposits/{id} - Chi tiết đơn nạp
 * - GET /deposits/history - Lịch sử nạp tiền
 * - GET /deposits/tokens/history - Lịch sử token từ deposits
 */

import { apiRequest } from "./auth-api";

// =============================================================================
// Types
// =============================================================================

export interface PricingTier {
  id: string;
  name: string;
  price: number; // VND
  tokens: number;
  bonus: number;
  popular?: boolean;
}

// Backend response format
interface BackendPricingResponse {
  pricePerMillion: number;
  currency: string;
  minimumTokens: number;
  minimumVnd: number;
  packages: Array<{
    id: string;
    name: string;
    tokens: number;
    priceVnd: number;
    bonus: number;
    popular: boolean;
  }>;
}

export interface PricingResponse {
  tiers: PricingTier[];
  currency: string;
  pricePerMillion: number;
  minimumTokens: number;
}

export interface PaymentInfo {
  bankName: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  qrCodeUrl: string;
}

// Backend payment info format (snake_case from API)
interface BackendPaymentInfo {
  bank_name: string;
  account_number: string;
  account_name: string;
  transfer_content: string;
  qr_code_url: string;
}

// Backend response format (snake_case from API)
interface BackendDepositOrder {
  id: string;
  order_code: string;
  token_amount: number;
  amount_vnd: number;
  status: string;
  payment_info: BackendPaymentInfo;
  expires_at: string;
  created_at: string;
  completed_at?: string;
}

// Frontend-friendly format
export interface DepositOrder {
  id: string;
  orderCode: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  amount: number; // VND
  tokens: number;
  paymentInfo: PaymentInfo;
  expiresAt: string;
  createdAt: string;
  completedAt?: string;
}

export interface CreateDepositRequest {
  // Option 1: By tier ID (e.g., "tier_starter", "tier_pro")
  tierId?: string;
  // Option 2: By VND amount
  amount?: number;
}

export interface DepositHistoryResponse {
  deposits: DepositOrder[];
  total: number;
}

export interface TokenTransaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  balance: number;
  description: string;
  createdAt: string;
  depositId?: string;
}

export interface TokenHistoryResponse {
  transactions: TokenTransaction[];
  total: number;
  totalTokens: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get pricing tiers (public endpoint)
 */
export async function getPricing(): Promise<PricingResponse> {
  const response = await apiRequest<BackendPricingResponse>("/deposits/pricing");

  // Transform backend packages to frontend tiers
  return {
    tiers: response.packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      price: pkg.priceVnd,
      tokens: pkg.tokens,
      bonus: pkg.bonus,
      popular: pkg.popular,
    })),
    currency: response.currency,
    pricePerMillion: response.pricePerMillion,
    minimumTokens: response.minimumTokens,
  };
}

// Transform backend payment info to frontend format
function transformPaymentInfo(backend: BackendPaymentInfo): PaymentInfo {
  return {
    bankName: backend.bank_name,
    accountNumber: backend.account_number,
    accountName: backend.account_name,
    transferContent: backend.transfer_content,
    qrCodeUrl: backend.qr_code_url,
  };
}

// Transform backend deposit to frontend format
// Handles both snake_case and camelCase from backend
function transformDeposit(backend: BackendDepositOrder & Record<string, unknown>): DepositOrder {
  // Backend may return snake_case or camelCase depending on endpoint
  const orderCode = backend.order_code ?? (backend as unknown as { orderCode?: string }).orderCode ?? "";
  const amountVnd = backend.amount_vnd ?? (backend as unknown as { amountVnd?: number }).amountVnd ?? 0;
  const tokenAmount = backend.token_amount ?? (backend as unknown as { tokenAmount?: number }).tokenAmount ?? 0;
  const expiresAt = backend.expires_at ?? (backend as unknown as { expiresAt?: string }).expiresAt ?? "";
  const createdAt = backend.created_at ?? (backend as unknown as { createdAt?: string }).createdAt ?? "";
  const completedAt = backend.completed_at ?? (backend as unknown as { completedAt?: string }).completedAt;

  // Handle payment info - could be snake_case or camelCase
  const paymentInfoRaw = backend.payment_info ?? (backend as unknown as { paymentInfo?: BackendPaymentInfo }).paymentInfo;
  let paymentInfo: PaymentInfo;
  if (paymentInfoRaw) {
    // Check if it's already camelCase
    const pi = paymentInfoRaw as BackendPaymentInfo & Record<string, unknown>;
    paymentInfo = {
      bankName: pi.bank_name ?? (pi as unknown as { bankName?: string }).bankName ?? "",
      accountNumber: pi.account_number ?? (pi as unknown as { accountNumber?: string }).accountNumber ?? "",
      accountName: pi.account_name ?? (pi as unknown as { accountName?: string }).accountName ?? "",
      transferContent: pi.transfer_content ?? (pi as unknown as { transferContent?: string }).transferContent ?? "",
      qrCodeUrl: pi.qr_code_url ?? (pi as unknown as { qrCodeUrl?: string }).qrCodeUrl ?? "",
    };
  } else {
    paymentInfo = {
      bankName: "",
      accountNumber: "",
      accountName: "",
      transferContent: "",
      qrCodeUrl: "",
    };
  }

  return {
    id: backend.id,
    orderCode,
    status: backend.status as DepositOrder["status"],
    amount: amountVnd,
    tokens: tokenAmount,
    paymentInfo,
    expiresAt,
    createdAt,
    completedAt,
  };
}

/**
 * Create deposit order
 * @param request - Either { tierId: "tier_pro" } or { amount: 150000 }
 */
export async function createDeposit(
  request: CreateDepositRequest,
): Promise<DepositOrder> {
  // Build request body - send tierId or amount
  const body: Record<string, unknown> = {};
  if (request.tierId) {
    body.tierId = request.tierId;
  } else if (request.amount) {
    body.amount = request.amount;
  }

  const response = await apiRequest<BackendDepositOrder>("/deposits", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return transformDeposit(response);
}

// Backend pending response format
interface BackendPendingResponse {
  hasPending: boolean;
  order: BackendDepositOrder | null;
}

/**
 * Get pending deposit order (if any)
 */
export async function getPendingDeposit(): Promise<DepositOrder | null> {
  try {
    const result = await apiRequest<BackendPendingResponse>("/deposits/pending");
    // Check if result has pending order
    if (!result || !result.hasPending || !result.order) return null;
    return transformDeposit(result.order);
  } catch {
    return null;
  }
}

/**
 * Get deposit order by ID
 */
export async function getDeposit(orderId: string): Promise<DepositOrder> {
  const response = await apiRequest<BackendDepositOrder>(`/deposits/${orderId}`);
  return transformDeposit(response);
}

/**
 * Cancel pending deposit order
 */
export async function cancelDeposit(orderId: string): Promise<void> {
  await apiRequest(`/deposits/${orderId}`, {
    method: "DELETE",
  });
}

// Backend history response
interface BackendHistoryResponse {
  orders: BackendDepositOrder[];
  total: number;
}

/**
 * Get deposit history
 */
export async function getDepositHistory(
  limit = 20,
  offset = 0,
  status?: "pending" | "completed" | "cancelled" | "expired",
): Promise<DepositHistoryResponse> {
  let url = `/deposits/history?limit=${limit}&offset=${offset}`;
  if (status) {
    url += `&status=${status}`;
  }
  const response = await apiRequest<BackendHistoryResponse>(url);
  return {
    deposits: response.orders.map(transformDeposit),
    total: response.total,
  };
}

/**
 * Get token history from deposits
 */
export async function getTokenHistory(
  limit = 20,
  offset = 0,
): Promise<TokenHistoryResponse> {
  return apiRequest<TokenHistoryResponse>(
    `/deposits/tokens/history?limit=${limit}&offset=${offset}`,
  );
}

/**
 * Poll deposit status until completed, cancelled, or timeout
 */
export async function pollDepositStatus(
  orderId: string,
  intervalMs = 3000,
  timeoutMs = 300000,
): Promise<DepositOrder> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const order = await getDeposit(orderId);

    if (order.status === "completed" || order.status === "cancelled" || order.status === "expired") {
      return order;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Deposit status polling timed out");
}
