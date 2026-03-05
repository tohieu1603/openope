import { restoreSession, type AuthUser } from "./auth-api";
/**
 * Billing domain action functions.
 * Each function takes a BillingHost (the app instance) and mutates its @state properties directly,
 * which triggers Lit reactivity.
 */
import { showConfirm } from "./components/operis-confirm";
import { showToast } from "./components/operis-toast";
import {
  getPricing,
  createDeposit,
  getPendingDeposit,
  getDeposit,
  cancelDeposit,
  getDepositHistory,
  type PricingTier,
  type DepositOrder,
} from "./deposits-api";
import { getTokenBalance } from "./tokens-api";

export interface BillingHost {
  // User
  currentUser: AuthUser | null;

  // Pricing
  billingPricingTiers: PricingTier[];
  billingPricingLoading: boolean;
  billingSelectedPackage: number;
  billingPaymentMode: "tier" | "amount";
  billingCustomAmount: string;
  billingFreeResetAt: number;

  // Buy
  billingBuyLoading: boolean;

  // Pending order / QR
  billingPendingOrder: DepositOrder | null;
  billingShowQrModal: boolean;
  billingCheckingTransaction: boolean;

  // History
  billingDepositHistory: DepositOrder[];
  billingHistoryLoading: boolean;
  billingHistoryPage: number;

  // Detail modal
  billingShowDetailModal: boolean;
  billingSelectedDeposit: DepositOrder | null;
  billingDetailLoading: boolean;

  // API keys (local only — no backend yet)
  billingApiKeys: Array<{ id: string; name: string; key: string; createdAt: number }>;
  billingShowCreateKeyModal: boolean;
  billingNewKeyName: string;
}

export async function loadBillingData(host: BillingHost) {
  // Load pricing tiers
  host.billingPricingLoading = true;
  try {
    const pricingResponse = await getPricing();
    host.billingPricingTiers = pricingResponse.tiers;
    const popularIndex = pricingResponse.tiers.findIndex((t) => t.popular);
    if (popularIndex >= 0) host.billingSelectedPackage = popularIndex;
  } catch (err) {
    console.error("Failed to load pricing:", err);
  } finally {
    host.billingPricingLoading = false;
  }

  // Load token balance (includes free reset countdown)
  try {
    const bal = await getTokenBalance();
    host.billingFreeResetAt = bal.next_free_reset_at;
    if (host.currentUser) {
      host.currentUser = {
        ...host.currentUser,
        token_balance: bal.paid,
        free_token_balance: bal.free,
      };
    }
  } catch {
    /* keep existing values */
  }

  // Load pending order
  try {
    host.billingPendingOrder = await getPendingDeposit();
  } catch {
    host.billingPendingOrder = null;
  }

  // Load deposit history
  await loadBillingHistory(host);
}

export async function loadBillingHistory(host: BillingHost) {
  host.billingHistoryLoading = true;
  host.billingHistoryPage = 1;
  try {
    const historyResponse = await getDepositHistory(1000, 0);
    host.billingDepositHistory = historyResponse.deposits;
  } catch (err) {
    console.error("Failed to load deposit history:", err);
  } finally {
    host.billingHistoryLoading = false;
  }
}

export function handleBillingHistoryPageChange(host: BillingHost, page: number) {
  host.billingHistoryPage = page;
}

export async function handleBillingBuyTokens(host: BillingHost) {
  host.billingBuyLoading = true;
  try {
    let order;
    if (host.billingPaymentMode === "amount") {
      const amount = Number(host.billingCustomAmount);
      if (!amount || amount <= 0) return;
      order = await createDeposit({ amount });
    } else {
      const tier = host.billingPricingTiers[host.billingSelectedPackage];
      if (!tier) return;
      order = await createDeposit({ tierId: tier.id });
    }
    host.billingPendingOrder = order;
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Không thể tạo đơn nạp", "error");
  } finally {
    host.billingBuyLoading = false;
  }
}

export function handleBillingCloseQrModal(host: BillingHost) {
  host.billingShowQrModal = false;
}

export async function handleBillingCheckTransaction(host: BillingHost) {
  if (!host.billingPendingOrder) return;

  host.billingCheckingTransaction = true;
  try {
    const order = await getDeposit(host.billingPendingOrder.id);
    host.billingPendingOrder = order;

    if (order.status === "completed") {
      showToast("Giao dịch thành công! Token đã được cộng vào tài khoản.", "success");
      host.billingPendingOrder = null;
      const user = await restoreSession();
      if (user) host.currentUser = user;
      await loadBillingHistory(host);
    } else if (order.status === "cancelled" || order.status === "expired") {
      showToast("Đơn nạp đã bị hủy hoặc hết hạn.", "error");
      host.billingPendingOrder = null;
      await loadBillingHistory(host);
    }
  } catch (err) {
    console.error("Failed to check transaction:", err);
  } finally {
    host.billingCheckingTransaction = false;
  }
}

export async function handleBillingCancelPending(host: BillingHost) {
  if (!host.billingPendingOrder) return;

  const confirmed = await showConfirm({
    title: "Hủy đơn nạp?",
    message: "Bạn có chắc muốn hủy đơn nạp này?",
    confirmText: "Hủy đơn",
    cancelText: "Không",
    variant: "danger",
  });

  if (confirmed) {
    try {
      await cancelDeposit(host.billingPendingOrder.id);
      host.billingPendingOrder = null;
      host.billingShowQrModal = false;
      await loadBillingHistory(host);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể hủy đơn", "error");
    }
  }
}

export function handleBillingRefreshHistory(host: BillingHost) {
  loadBillingHistory(host);
}

export async function handleViewDepositDetail(host: BillingHost, deposit: DepositOrder) {
  host.billingSelectedDeposit = deposit;
  host.billingShowDetailModal = true;
  host.billingDetailLoading = true;

  try {
    const fullDeposit = await getDeposit(deposit.id);
    host.billingSelectedDeposit = fullDeposit;
  } catch (err) {
    console.error("Failed to fetch deposit details:", err);
  } finally {
    host.billingDetailLoading = false;
  }
}

export function handleCloseDetailModal(host: BillingHost) {
  host.billingShowDetailModal = false;
  host.billingSelectedDeposit = null;
}

export function handleBillingCreateKey(host: BillingHost) {
  if (!host.billingNewKeyName.trim()) return;
  const newKey = {
    id: Date.now().toString(),
    name: host.billingNewKeyName.trim(),
    key: `sk-...${Math.random().toString(36).substring(2, 8)}`,
    createdAt: Date.now(),
  };
  host.billingApiKeys = [...host.billingApiKeys, newKey];
  host.billingNewKeyName = "";
  host.billingShowCreateKeyModal = false;
  showToast("Đã tạo API key", "success");
}

export function handleBillingCopyKey(_host: BillingHost, key: string) {
  navigator.clipboard.writeText(key);
  showToast("Đã sao chép key!", "success");
}

export async function handleBillingDeleteKey(host: BillingHost, id: string) {
  const confirmed = await showConfirm({
    title: "Xóa API key?",
    message: "Bạn có chắc muốn xóa API key này? Hành động này không thể hoàn tác.",
    confirmText: "Xóa",
    cancelText: "Hủy",
    variant: "danger",
  });
  if (confirmed) {
    host.billingApiKeys = host.billingApiKeys.filter((k) => k.id !== id);
    showToast("Đã xóa API key", "success");
  }
}
