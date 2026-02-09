import { html, nothing } from "lit";
import { icons } from "../icons";
import type { PricingTier, DepositOrder } from "../deposits-api";

export type PaymentMode = "tier" | "amount";

export interface BillingProps {
  // Balance
  creditBalance?: number;
  // Payment mode: select tier or enter custom amount
  paymentMode?: PaymentMode;
  onPaymentModeChange?: (mode: PaymentMode) => void;
  // Pricing tiers from API
  pricingTiers?: PricingTier[];
  pricingLoading?: boolean;
  // Package selection
  selectedPackage?: number;
  onSelectPackage?: (index: number) => void;
  // Custom amount
  customAmount?: string;
  onCustomAmountChange?: (value: string) => void;
  // Buy Tokens / QR Payment
  onBuyTokens?: () => void;
  buyLoading?: boolean;
  // Pending order (from API)
  pendingOrder?: DepositOrder | null;
  onCancelPending?: () => void;
  // QR Modal
  showQrModal?: boolean;
  onCloseQrModal?: () => void;
  onCheckTransaction?: () => void;
  checkingTransaction?: boolean;
  // Auto top-up
  autoTopUp?: boolean;
  onToggleAutoTopUp?: () => void;
  // Transaction history
  depositHistory?: DepositOrder[];
  historyLoading?: boolean;
  historyPage?: number;
  historyTotalPages?: number;
  onRefreshHistory?: () => void;
  onViewDepositDetail?: (deposit: DepositOrder) => void;
  onHistoryPageChange?: (page: number) => void;
  // Detail modal
  showDetailModal?: boolean;
  selectedDeposit?: DepositOrder | null;
  detailLoading?: boolean;
  onCloseDetailModal?: () => void;
  // API Keys
  apiKeys?: Array<{ id: string; name: string; key: string; createdAt: number }>;
  showCreateKeyModal?: boolean;
  newKeyName?: string;
  onOpenCreateKeyModal?: () => void;
  onCloseCreateKeyModal?: () => void;
  onNewKeyNameChange?: (name: string) => void;
  onCreateKey?: () => void;
  onCopyKey?: (key: string) => void;
  onDeleteKey?: (id: string) => void;
}

function formatNumber(num: number): string {
  return num.toLocaleString("vi-VN");
}

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

function formatDate(ts: number | string): string {
  const date = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return date.toLocaleDateString("vi-VN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Chờ thanh toán";
    case "completed":
      return "Hoàn thành";
    case "cancelled":
      return "Đã hủy";
    case "expired":
      return "Hết hạn";
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "pending":
      return "status-pending";
    case "completed":
      return "status-success";
    case "cancelled":
    case "expired":
      return "status-error";
    default:
      return "";
  }
}

// Generate page numbers with ellipsis for large page counts
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push("...");
  }

  // Show pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

export function renderBilling(props: BillingProps) {
  const creditBalance = props.creditBalance ?? 0;
  const paymentMode = props.paymentMode ?? "tier";
  const pricingTiers = props.pricingTiers ?? [];
  const pricingLoading = props.pricingLoading ?? false;
  const selectedPackage = props.selectedPackage ?? 0;
  const customAmount = props.customAmount ?? "";
  const autoTopUp = props.autoTopUp ?? false;
  const apiKeys = props.apiKeys ?? [];
  const showCreateKeyModal = props.showCreateKeyModal ?? false;
  const newKeyName = props.newKeyName ?? "";
  const showQrModal = props.showQrModal ?? false;
  const pendingOrder = props.pendingOrder ?? null;
  const depositHistory = props.depositHistory ?? [];
  const historyLoading = props.historyLoading ?? false;
  const historyPage = props.historyPage ?? 1;
  const historyTotalPages = props.historyTotalPages ?? 1;
  const buyLoading = props.buyLoading ?? false;
  const checkingTransaction = props.checkingTransaction ?? false;
  const showDetailModal = props.showDetailModal ?? false;
  const selectedDeposit = props.selectedDeposit ?? null;
  const detailLoading = props.detailLoading ?? false;

  const selectedTier = pricingTiers[selectedPackage];

  return html`
    <style>
      .billing-layout {
        display: grid;
        gap: 24px;
      }
      .billing-row {
        display: grid;
        grid-template-columns: 1fr 1.5fr;
        gap: 24px;
      }
      @media (max-width: 900px) {
        .billing-row {
          grid-template-columns: 1fr;
        }
      }
      .b-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .b-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
      }
      .b-card-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .b-card-header-icon {
        width: 20px;
        height: 20px;
        color: var(--muted);
      }
      .b-card-header-icon svg {
        width: 100%;
        height: 100%;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .b-card-body {
        padding: 24px;
      }
      .balance-amount {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 4px;
      }
      .balance-value {
        font-size: 32px;
        font-weight: 700;
        color: var(--text-strong);
      }
      .balance-label {
        font-size: 14px;
        color: var(--muted);
      }
      .balance-note {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
      }
      .balance-note svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        flex-shrink: 0;
      }
      .rate-limit {
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid var(--border);
      }
      .rate-limit-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 12px;
      }
      .rate-limit-desc {
        font-size: 13px;
        color: var(--text);
        line-height: 1.5;
        margin-bottom: 12px;
      }
      .rate-limit-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .rate-limit-item svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        margin-top: 2px;
        flex-shrink: 0;
      }
      .rate-limit-note {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.5;
        margin-top: 16px;
      }
      .packages-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }
      .package-card {
        position: relative;
        padding: 16px;
        background: var(--bg);
        border: 2px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .package-card:hover {
        border-color: var(--border-strong);
      }
      .package-card.selected {
        border-color: var(--accent);
        background: var(--accent-subtle);
      }
      .package-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .package-price {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-strong);
      }
      .package-tokens {
        font-size: 13px;
        color: var(--muted);
        margin-top: 4px;
      }
      .package-bonus {
        font-size: 11px;
        color: var(--accent);
        margin-top: 2px;
      }
      .package-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        background: var(--accent);
        color: var(--accent-foreground);
        border-radius: var(--radius-sm);
      }
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .toggle-label {
        font-size: 14px;
        color: var(--text);
      }
      .toggle-switch {
        position: relative;
        width: 44px;
        height: 24px;
        background: var(--border);
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .toggle-switch.active {
        background: var(--accent);
      }
      .toggle-switch::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        transition: transform 0.2s;
      }
      .toggle-switch.active::after {
        transform: translateX(20px);
      }
      .form-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
      }
      .order-summary {
        margin-top: 20px;
        padding: 16px;
        background: var(--bg);
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
      }
      .order-summary-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .order-summary-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
      }
      .order-summary-row:not(:last-child) {
        border-bottom: 1px solid var(--border);
      }
      .order-summary-label {
        font-size: 13px;
        color: var(--muted);
      }
      .order-summary-tokens {
        font-size: 18px;
        font-weight: 700;
        color: var(--accent);
      }
      .payment-method-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--secondary);
        border-radius: var(--radius-sm);
      }
      .payment-method-badge svg {
        width: 18px;
        height: 18px;
        color: var(--accent);
      }
      .payment-method-info {
        display: flex;
        flex-direction: column;
      }
      .payment-method-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
      }
      .payment-method-desc {
        font-size: 11px;
        color: var(--muted);
      }
      .buy-btn {
        width: 100%;
        margin-top: 16px;
        padding: 16px;
        font-size: 16px;
        font-weight: 600;
        background: var(--accent);
        color: var(--accent-foreground);
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .buy-btn svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .buy-btn:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
      }
      .buy-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .auto-payments-desc {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.6;
        margin-bottom: 20px;
      }
      .history-empty {
        text-align: center;
        padding: 32px;
        color: var(--muted);
        font-size: 14px;
      }
      .history-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .history-item {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        padding-left: 20px;
        background: var(--bg);
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        border-left: 3px solid var(--border);
        transition: border-color 0.15s;
      }
      .history-item:hover {
        border-color: var(--border-strong);
      }
      .history-item.item-completed {
        border-left-color: #16a34a;
      }
      .history-item.item-pending {
        border-left-color: #d97706;
      }
      .history-item.item-cancelled,
      .history-item.item-expired {
        border-left-color: var(--danger, #dc2626);
      }
      .history-item-main {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .history-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .history-order-code {
        font-size: 11px;
        font-family: var(--mono);
        color: var(--muted);
        background: var(--secondary);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        display: inline-block;
        width: fit-content;
        margin-bottom: 4px;
      }
      .history-amount {
        font-size: 16px;
        font-weight: 700;
        color: var(--text-strong);
      }
      .history-date {
        font-size: 12px;
        color: var(--muted);
      }
      .history-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }
      .history-tokens {
        font-size: 15px;
        font-weight: 700;
        color: #16a34a;
      }
      .history-tokens.tokens-pending {
        color: #d97706;
      }
      .history-tokens.tokens-error {
        color: var(--muted);
        text-decoration: line-through;
      }
      .history-status {
        font-size: 12px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: var(--radius-sm);
      }
      .status-pending {
        background: #fef3c7;
        color: #92400e;
      }
      .status-success {
        background: #dcfce7;
        color: #166534;
      }
      .status-error {
        background: #fee2e2;
        color: #991b1b;
      }
      .history-item-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .history-detail-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text);
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s;
      }
      .history-detail-btn:hover {
        background: var(--secondary);
        border-color: var(--border-strong);
      }
      .history-detail-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .history-payment-info {
        font-size: 12px;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .history-payment-info svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
      }
      .pagination-info {
        font-size: 13px;
        color: var(--muted);
      }
      .pagination-info span {
        color: var(--text);
        font-weight: 500;
      }
      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .pagination-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
        height: 36px;
        padding: 0 4px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        color: var(--muted);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .pagination-btn:hover:not(:disabled):not(.active) {
        background: var(--secondary);
        color: var(--text);
      }
      .pagination-btn.active {
        background: var(--accent);
        color: var(--accent-foreground);
        border-color: var(--accent);
      }
      .pagination-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .pagination-btn.nav {
        background: var(--secondary);
        border-color: var(--border);
        color: var(--text);
      }
      .pagination-btn.nav:hover:not(:disabled) {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .pagination-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .pagination-ellipsis {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--muted);
        font-size: 14px;
        user-select: none;
      }
      .refresh-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        background: var(--secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .refresh-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .refresh-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .api-key-list {
        display: flex;
        flex-direction: column;
      }
      .api-key-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 0;
        border-bottom: 1px solid var(--border);
      }
      .api-key-item:last-child {
        border-bottom: none;
      }
      .api-key-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary);
        border-radius: var(--radius-md);
        color: var(--muted);
      }
      .api-key-icon svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .api-key-info {
        flex: 1;
        min-width: 0;
      }
      .api-key-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong);
      }
      .api-key-value {
        font-size: 13px;
        font-family: var(--mono);
        color: var(--muted);
        margin-top: 2px;
      }
      .api-key-date {
        font-size: 12px;
        color: var(--muted);
        margin-top: 4px;
      }
      .api-key-actions {
        display: flex;
        gap: 8px;
      }
      .api-key-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--muted);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .api-key-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
        border-color: var(--border-strong);
      }
      .api-key-btn.danger:hover {
        background: var(--danger-subtle);
        color: var(--danger);
        border-color: var(--danger);
      }
      .api-key-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .api-empty {
        text-align: center;
        padding: 32px;
      }
      .api-empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary);
        border-radius: var(--radius-lg);
        color: var(--muted);
      }
      .api-empty-icon svg {
        width: 24px;
        height: 24px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .api-empty-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong);
        margin-bottom: 4px;
      }
      .api-empty-desc {
        font-size: 13px;
        color: var(--muted);
      }
      .create-key-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        background: var(--accent);
        color: var(--accent-foreground);
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .create-key-btn:hover {
        background: var(--accent-hover);
      }
      .create-key-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .modal-btn {
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 500;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .modal-btn-secondary {
        background: var(--secondary);
        border: 1px solid var(--border);
        color: var(--text);
      }
      .modal-btn-secondary:hover {
        background: var(--bg-hover);
      }
      .modal-btn-primary {
        background: var(--accent);
        border: none;
        color: var(--accent-foreground);
      }
      .modal-btn-primary:hover {
        background: var(--accent-hover);
      }
      .modal-btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .qr-payment {
        text-align: center;
      }
      .qr-payment-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 16px;
        line-height: 1.4;
      }
      .qr-bank-info {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 16px;
        margin-bottom: 20px;
        text-align: left;
      }
      .qr-bank-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      .qr-bank-row:last-child {
        border-bottom: none;
      }
      .qr-bank-label {
        font-size: 13px;
        color: var(--muted);
      }
      .qr-bank-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
        font-family: var(--mono);
      }
      .qr-bank-value.highlight {
        color: var(--accent);
        font-size: 16px;
      }
      .qr-image-container {
        background: white;
        border-radius: var(--radius-lg);
        padding: 16px;
        display: inline-block;
        margin-bottom: 24px;
      }
      .qr-image {
        width: 240px;
        height: 240px;
        display: block;
      }
      .qr-check-btn {
        width: 100%;
        padding: 16px 24px;
        font-size: 16px;
        font-weight: 600;
        background: #ff6b35;
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .qr-check-btn:hover:not(:disabled) {
        background: #e55a2b;
      }
      .qr-check-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .qr-cancel-btn {
        width: 100%;
        margin-top: 12px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 500;
        background: transparent;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .qr-cancel-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
      }
      .qr-note {
        margin-top: 16px;
        padding: 12px 16px;
        background: var(--warning-subtle, #fef3c7);
        color: var(--warning, #d97706);
        border-radius: var(--radius-md);
        font-size: 13px;
        line-height: 1.5;
      }
      .loading-skeleton {
        background: linear-gradient(
          90deg,
          var(--bg) 25%,
          var(--border) 50%,
          var(--bg) 75%
        );
        background-size: 200% 100%;
        animation: skeleton 1.5s infinite;
        border-radius: var(--radius-md);
      }
      @keyframes skeleton {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* Payment Inline Styles */
      .payment-inline {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .payment-inline-header {
        padding: 16px;
        background: var(--accent-subtle);
        border-bottom: 1px solid var(--border);
      }
      .payment-inline-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 8px;
      }
      .payment-inline-badge svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .payment-inline-summary {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .payment-inline-amount {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-strong);
      }
      .payment-inline-tokens {
        font-size: 14px;
        color: var(--accent);
        font-weight: 600;
      }
      .payment-inline-content {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 24px;
        padding: 20px;
      }
      @media (max-width: 600px) {
        .payment-inline-content {
          grid-template-columns: 1fr;
        }
      }
      .payment-qr-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .payment-qr-wrapper {
        background: white;
        border-radius: var(--radius-md);
        padding: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .payment-qr-image {
        width: 180px;
        height: 180px;
        display: block;
      }
      .payment-qr-hint {
        font-size: 12px;
        color: var(--muted);
        text-align: center;
      }
      .payment-bank-details {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .payment-bank-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .payment-bank-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: var(--card);
        border-radius: var(--radius-sm);
      }
      .payment-bank-row.highlight {
        background: var(--accent-subtle);
      }
      .payment-bank-label {
        font-size: 13px;
        color: var(--muted);
      }
      .payment-bank-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
        font-family: var(--mono);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .payment-bank-value.accent {
        color: var(--accent);
        font-size: 15px;
      }
      .payment-bank-value.copyable {
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .payment-bank-value.copyable:hover {
        opacity: 0.7;
      }
      .payment-bank-value.copyable svg {
        width: 14px;
        height: 14px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 2;
      }
      .payment-inline-note {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin: 0 20px;
        padding: 12px 16px;
        background: var(--warning-subtle, #fef3c7);
        color: var(--warning, #d97706);
        border-radius: var(--radius-md);
        font-size: 13px;
        line-height: 1.5;
      }
      .payment-inline-note svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        margin-top: 1px;
      }
      .payment-inline-actions {
        display: flex;
        gap: 12px;
        padding: 20px;
      }
      .payment-check-btn {
        flex: 1;
        padding: 14px 20px;
        font-size: 15px;
        font-weight: 600;
        background: #ff6b35;
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .payment-check-btn:hover:not(:disabled) {
        background: #e55a2b;
      }
      .payment-check-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .payment-check-btn svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .payment-cancel-btn {
        padding: 14px 20px;
        font-size: 14px;
        font-weight: 500;
        background: transparent;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
      }
      .payment-cancel-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
        border-color: var(--border-strong);
      }
      .payment-cancel-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Detail Modal Styles */
      .detail-modal {
        max-width: 480px;
      }
      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .detail-order-code {
        font-size: 12px;
        font-family: var(--mono);
        color: var(--muted);
        background: var(--secondary);
        padding: 4px 10px;
        border-radius: var(--radius-sm);
      }
      .detail-status {
        font-size: 12px;
        padding: 4px 10px;
        border-radius: var(--radius-sm);
        font-weight: 600;
      }
      .detail-amount-section {
        text-align: center;
        padding: 24px;
        background: var(--bg);
        border-radius: var(--radius-md);
        margin-bottom: 20px;
      }
      .detail-amount {
        font-size: 32px;
        font-weight: 700;
        color: var(--text-strong);
        margin-bottom: 4px;
      }
      .detail-tokens {
        font-size: 16px;
        color: var(--accent);
        font-weight: 600;
      }
      .detail-info-grid {
        display: grid;
        gap: 12px;
        margin-bottom: 20px;
      }
      .detail-info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg);
        border-radius: var(--radius-sm);
      }
      .detail-info-label {
        font-size: 13px;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detail-info-label svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .detail-info-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .detail-info-value.mono {
        font-family: var(--mono);
      }
      .detail-payment-section {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }
      .detail-payment-header {
        padding: 12px 16px;
        background: var(--secondary);
        font-size: 13px;
        font-weight: 600;
        color: var(--text-strong);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detail-payment-header svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .detail-payment-body {
        padding: 16px;
      }
      .detail-payment-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      .detail-payment-row:last-child {
        border-bottom: none;
      }
      .detail-payment-label {
        font-size: 13px;
        color: var(--muted);
      }
      .detail-payment-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-strong);
        font-family: var(--mono);
      }
      .detail-close-btn {
        width: 100%;
        margin-top: 20px;
        padding: 14px;
        font-size: 14px;
        font-weight: 500;
        background: var(--secondary);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s;
      }
      .detail-close-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .detail-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: var(--muted);
      }
      .payment-mode-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }
      .payment-mode-tab {
        flex: 1;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        background: var(--bg);
        border: none;
        color: var(--muted);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .payment-mode-tab:not(:last-child) {
        border-right: 1px solid var(--border);
      }
      .payment-mode-tab.active {
        background: var(--accent);
        color: var(--accent-foreground);
        font-weight: 600;
      }
      .payment-mode-tab:hover:not(.active) {
        background: var(--bg-hover);
        color: var(--text);
      }
      .custom-amount-input {
        width: 100%;
        padding: 14px 16px;
        font-size: 18px;
        font-weight: 600;
        background: var(--bg);
        border: 2px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text-strong);
        outline: none;
        transition: border-color 0.15s;
        box-sizing: border-box;
      }
      .custom-amount-input:focus {
        border-color: var(--accent);
      }
      .custom-amount-input::placeholder {
        color: var(--muted);
        font-weight: 400;
        font-size: 14px;
      }
      .custom-amount-hint {
        font-size: 12px;
        color: var(--muted);
        margin-top: 8px;
      }
    </style>

    <div class="billing-layout">
      <div class="billing-row">
        <div class="b-card">
          <div class="b-card-header">
            <span class="b-card-title">Thông Tin Số Dư</span>
            <span class="b-card-header-icon">${icons.creditCard}</span>
          </div>
          <div class="b-card-body">
            <div class="balance-amount">
              <span class="balance-value">${formatNumber(creditBalance)}</span>
              <span class="balance-label">tokens</span>
            </div>
            <div class="balance-label">Số dư hiện tại</div>
            <div class="balance-note">
              ${icons.clock}
              <span>Tokens không hết hạn và có thể dùng bất cứ lúc nào</span>
            </div>
            <div class="rate-limit">
              <div class="rate-limit-title">Giới Hạn Tốc Độ</div>
              <div class="rate-limit-desc">
                Mỗi tài khoản giới hạn 20 yêu cầu mới mỗi 10 giây (≈ 100+ tác vụ
                đồng thời).
              </div>
              <div class="rate-limit-item">
                ${icons.clock}<span>Áp dụng cho mỗi tài khoản</span>
              </div>
              <div class="rate-limit-item">
                ${icons.clock}<span
                  >Yêu cầu vượt quá trả về HTTP 429 và không được xếp hàng</span
                >
              </div>
              <div class="rate-limit-note">
                Giới hạn này phù hợp với hầu hết người dùng. Nếu thường xuyên
                gặp lỗi 429, liên hệ hỗ trợ để yêu cầu tăng.
              </div>
            </div>
          </div>
        </div>

        <div class="b-card">
          <div class="b-card-header">
            <span class="b-card-title">Thêm Tokens</span>
          </div>
          <div class="b-card-body">
            ${pendingOrder
              ? html`
                  <!-- Hiển thị thông tin thanh toán trực tiếp khi có đơn pending -->
                  <div class="payment-inline">
                    <div class="payment-inline-header">
                      <div class="payment-inline-badge">
                        ${icons.clock}
                        <span>Đơn nạp đang chờ thanh toán</span>
                      </div>
                      <div class="payment-inline-summary">
                        <span class="payment-inline-amount"
                          >${formatVND(pendingOrder.amount ?? 0)}</span
                        >
                        <span class="payment-inline-tokens"
                          >→ ${formatNumber(pendingOrder.tokens ?? 0)}
                          tokens</span
                        >
                      </div>
                    </div>

                    ${pendingOrder.paymentInfo
                      ? html`
                          <div class="payment-inline-content">
                            ${pendingOrder.paymentInfo.qrCodeUrl
                              ? html`
                                  <div class="payment-qr-section">
                                    <div class="payment-qr-wrapper">
                                      <img
                                        class="payment-qr-image"
                                        src="${pendingOrder.paymentInfo
                                          .qrCodeUrl}"
                                        alt="QR Code"
                                      />
                                    </div>
                                    <div class="payment-qr-hint">
                                      Quét mã QR bằng app ngân hàng
                                    </div>
                                  </div>
                                `
                              : nothing}

                            <div class="payment-bank-details">
                              <div class="payment-bank-title">
                                Thông tin chuyển khoản
                              </div>
                              <div class="payment-bank-row">
                                <span class="payment-bank-label"
                                  >Ngân hàng</span
                                >
                                <span class="payment-bank-value"
                                  >${pendingOrder.paymentInfo.bankName}</span
                                >
                              </div>
                              <div class="payment-bank-row">
                                <span class="payment-bank-label"
                                  >Số tài khoản</span
                                >
                                <span
                                  class="payment-bank-value copyable"
                                  @click=${() =>
                                    navigator.clipboard.writeText(
                                      pendingOrder.paymentInfo.accountNumber,
                                    )}
                                >
                                  ${pendingOrder.paymentInfo.accountNumber}
                                  ${icons.copy}
                                </span>
                              </div>
                              <div class="payment-bank-row">
                                <span class="payment-bank-label">Tên TK</span>
                                <span class="payment-bank-value"
                                  >${pendingOrder.paymentInfo.accountName}</span
                                >
                              </div>
                              <div class="payment-bank-row highlight">
                                <span class="payment-bank-label">Số tiền</span>
                                <span class="payment-bank-value accent"
                                  >${formatVND(pendingOrder.amount ?? 0)}</span
                                >
                              </div>
                              <div class="payment-bank-row highlight">
                                <span class="payment-bank-label"
                                  >Nội dung CK</span
                                >
                                <span
                                  class="payment-bank-value accent copyable"
                                  @click=${() =>
                                    navigator.clipboard.writeText(
                                      pendingOrder.paymentInfo.transferContent,
                                    )}
                                >
                                  ${pendingOrder.paymentInfo.transferContent}
                                  ${icons.copy}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div class="payment-inline-note">
                            ${icons.alertCircle}
                            <span
                              >Chuyển khoản <strong>ĐÚNG số tiền</strong> và
                              <strong>nội dung</strong>. Token được cộng tự động
                              trong 1-5 phút.</span
                            >
                          </div>
                        `
                      : html`
                          <div class="history-empty">
                            Không có thông tin thanh toán
                          </div>
                        `}

                    <div class="payment-inline-actions">
                      <button
                        class="payment-check-btn"
                        ?disabled=${checkingTransaction}
                        @click=${() => props.onCheckTransaction?.()}
                      >
                        ${checkingTransaction
                          ? "Đang kiểm tra..."
                          : html`${icons.refresh} Kiểm tra giao dịch`}
                      </button>
                      <button
                        class="payment-cancel-btn"
                        @click=${() => props.onCancelPending?.()}
                      >
                        ${icons.x} Hủy đơn
                      </button>
                    </div>
                  </div>
                `
              : html`
                  <!-- Payment mode tabs -->
                  <div class="payment-mode-tabs">
                    <button
                      class="payment-mode-tab ${paymentMode === "tier" ? "active" : ""}"
                      @click=${() => props.onPaymentModeChange?.("tier")}
                    >
                      Chọn Gói
                    </button>
                    <button
                      class="payment-mode-tab ${paymentMode === "amount" ? "active" : ""}"
                      @click=${() => props.onPaymentModeChange?.("amount")}
                    >
                      Nhập Số Tiền
                    </button>
                  </div>

                  ${paymentMode === "tier"
                    ? html`
                        ${pricingLoading
                          ? html`
                              <div class="packages-grid">
                                ${[1, 2, 3].map(
                                  () => html`
                                    <div
                                      class="loading-skeleton"
                                      style="height: 100px;"
                                    ></div>
                                  `,
                                )}
                              </div>
                            `
                          : pricingTiers.length === 0
                            ? html`
                                <div class="history-empty">Không có gói nào</div>
                              `
                            : html`
                                <div class="packages-grid">
                                  ${pricingTiers.map(
                                    (tier, i) => html`
                                      <div
                                        class="package-card ${selectedPackage === i
                                          ? "selected"
                                          : ""} ${tier.popular ? "popular" : ""}"
                                        @click=${() => props.onSelectPackage?.(i)}
                                      >
                                        ${tier.popular
                                          ? html`<div class="package-badge">
                                              PHỔ BIẾN
                                            </div>`
                                          : nothing}
                                        <div class="package-name">${tier.name}</div>
                                        <div class="package-price">
                                          ${formatVND(tier.price)}
                                        </div>
                                        <div class="package-tokens">
                                          ${formatNumber(tier.tokens)} tokens
                                        </div>
                                        ${tier.bonus > 0
                                          ? html`<div class="package-bonus">
                                              +${formatNumber(tier.bonus)} bonus
                                            </div>`
                                          : nothing}
                                      </div>
                                    `,
                                  )}
                                </div>
                              `}
                        ${selectedTier
                          ? html`
                              <div class="order-summary">
                                <div class="order-summary-title">
                                  Tóm tắt đơn hàng
                                </div>
                                <div class="order-summary-row">
                                  <span class="order-summary-label"
                                    >Bạn sẽ nhận được</span
                                  >
                                  <span class="order-summary-tokens"
                                    >${formatNumber(
                                      selectedTier.tokens + selectedTier.bonus,
                                    )}
                                    tokens</span
                                  >
                                </div>
                                <div class="order-summary-row">
                                  <span class="order-summary-label"
                                    >Phương thức thanh toán</span
                                  >
                                  <div class="payment-method-badge">
                                    ${icons.qrCode}
                                    <div class="payment-method-info">
                                      <span class="payment-method-name"
                                        >QR Ngân hàng</span
                                      >
                                      <span class="payment-method-desc"
                                        >Quét mã QR để chuyển khoản</span
                                      >
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button
                                class="buy-btn"
                                ?disabled=${buyLoading}
                                @click=${() => props.onBuyTokens?.()}
                              >
                                ${buyLoading
                                  ? html`<span>Đang xử lý...</span>`
                                  : html`${icons.qrCode} Mua Tokens`}
                              </button>
                            `
                          : nothing}
                      `
                    : html`
                        <!-- Custom amount input -->
                        <div class="form-label" style="margin-bottom: 8px;">Số tiền (VNĐ)</div>
                        <input
                          type="text"
                          inputmode="numeric"
                          class="custom-amount-input"
                          placeholder="Nhập số tiền, VD: 100000"
                          .value=${customAmount}
                          @input=${(e: Event) => {
                            const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, "");
                            props.onCustomAmountChange?.(raw);
                          }}
                        />
                        ${customAmount
                          ? html`<div class="custom-amount-hint">${formatVND(Number(customAmount))}</div>`
                          : html`<div class="custom-amount-hint">Nhập số tiền bạn muốn nạp</div>`}

                        ${Number(customAmount) > 0
                          ? html`
                              <div class="order-summary">
                                <div class="order-summary-title">Tóm tắt đơn hàng</div>
                                <div class="order-summary-row">
                                  <span class="order-summary-label">Số tiền</span>
                                  <span class="order-summary-tokens">${formatVND(Number(customAmount))}</span>
                                </div>
                                <div class="order-summary-row">
                                  <span class="order-summary-label">Phương thức thanh toán</span>
                                  <div class="payment-method-badge">
                                    ${icons.qrCode}
                                    <div class="payment-method-info">
                                      <span class="payment-method-name">QR Ngân hàng</span>
                                      <span class="payment-method-desc">Quét mã QR để chuyển khoản</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button
                                class="buy-btn"
                                ?disabled=${buyLoading}
                                @click=${() => props.onBuyTokens?.()}
                              >
                                ${buyLoading
                                  ? html`<span>Đang xử lý...</span>`
                                  : html`${icons.qrCode} Mua Tokens`}
                              </button>
                            `
                          : nothing}
                      `}
                `}
          </div>
        </div>
      </div>

      <div class="b-card">
        <div class="b-card-header">
          <span class="b-card-title">Thanh Toán Tự Động</span>
        </div>
        <div class="b-card-body">
          <div class="auto-payments-desc">
            Cấu hình thanh toán tự động bằng cách thêm thẻ vào tài khoản. Khi số
            dư gần ngưỡng Auto-Pay, chúng tôi sẽ nạp thêm tokens bằng thẻ đã lưu
            tối đa 10 phút một lần.
          </div>
          <div class="toggle-row" style="margin-bottom: 0;">
            <span class="toggle-label">Bật tự động nạp tiền</span>
            <div
              class="toggle-switch ${autoTopUp ? "active" : ""}"
              @click=${() => props.onToggleAutoTopUp?.()}
            ></div>
          </div>
        </div>
      </div>

      <div class="b-card">
        <div class="b-card-header">
          <span class="b-card-title">Lịch Sử Giao Dịch</span>
          <button
            class="refresh-btn"
            @click=${() => props.onRefreshHistory?.()}
          >
            ${icons.refresh} Làm mới
          </button>
        </div>
        <div class="b-card-body">
          ${historyLoading
            ? html`
                <div
                  class="loading-skeleton"
                  style="height: 60px; margin-bottom: 12px;"
                ></div>
                <div
                  class="loading-skeleton"
                  style="height: 60px; margin-bottom: 12px;"
                ></div>
                <div class="loading-skeleton" style="height: 60px;"></div>
              `
            : depositHistory.length === 0
              ? html` <div class="history-empty">Chưa có giao dịch nào</div> `
              : html`
                  <div class="history-list">
                    ${depositHistory.map(
                      (deposit) => html`
                        <div class="history-item item-${deposit.status}">
                          <div class="history-item-main">
                            <div class="history-info">
                              <div class="history-order-code">${deposit.orderCode}</div>
                              <div class="history-amount">
                                ${formatVND(deposit.amount)}
                              </div>
                              <div class="history-date">
                                ${formatDate(deposit.createdAt)}
                              </div>
                            </div>
                            <div class="history-right">
                              <span
                                class="history-status ${getStatusClass(
                                  deposit.status,
                                )}"
                                >${getStatusLabel(deposit.status)}</span
                              >
                              <div class="history-tokens ${deposit.status === "pending" ? "tokens-pending" : deposit.status === "cancelled" || deposit.status === "expired" ? "tokens-error" : ""}">
                                ${deposit.status === "cancelled" || deposit.status === "expired" ? "" : "+"}${formatNumber(deposit.tokens)} tokens
                              </div>
                            </div>
                          </div>
                          <div class="history-item-footer">
                            <div class="history-payment-info">
                              ${icons.creditCard}
                              <span>Chuyển khoản ngân hàng</span>
                            </div>
                            <button
                              class="history-detail-btn"
                              @click=${() => props.onViewDepositDetail?.(deposit)}
                            >
                              Xem chi tiết ${icons.chevronRight}
                            </button>
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                  ${historyTotalPages > 1
                    ? html`
                        <div class="pagination">
                          <div class="pagination-info">
                            Trang <span>${historyPage}</span> / <span>${historyTotalPages}</span>
                          </div>
                          <div class="pagination-controls">
                            <button
                              class="pagination-btn nav"
                              ?disabled=${historyPage <= 1}
                              @click=${() => props.onHistoryPageChange?.(historyPage - 1)}
                              title="Trang trước"
                            >
                              ${icons.chevronLeft}
                            </button>
                            ${getPageNumbers(historyPage, historyTotalPages).map((page) =>
                              page === "..."
                                ? html`<span class="pagination-ellipsis">…</span>`
                                : html`
                                    <button
                                      class="pagination-btn ${page === historyPage ? "active" : ""}"
                                      @click=${() => props.onHistoryPageChange?.(page as number)}
                                    >
                                      ${page}
                                    </button>
                                  `,
                            )}
                            <button
                              class="pagination-btn nav"
                              ?disabled=${historyPage >= historyTotalPages}
                              @click=${() => props.onHistoryPageChange?.(historyPage + 1)}
                              title="Trang sau"
                            >
                              ${icons.chevronRight}
                            </button>
                          </div>
                        </div>
                      `
                    : nothing}
                `}
        </div>
      </div>

      <div class="b-card">
        <div class="b-card-header">
          <div>
            <span class="b-card-title">API Keys</span>
            <div style="font-size: 13px; color: var(--muted); margin-top: 2px;">
              Quản lý khóa truy cập API của bạn
            </div>
          </div>
          <button
            class="create-key-btn"
            @click=${() => props.onOpenCreateKeyModal?.()}
          >
            ${icons.plus} Tạo Key Mới
          </button>
        </div>
        <div class="b-card-body">
          ${apiKeys.length === 0
            ? html`
                <div class="api-empty">
                  <div class="api-empty-icon">${icons.key}</div>
                  <div class="api-empty-title">Chưa có API key</div>
                  <div class="api-empty-desc">
                    Tạo API key để bắt đầu tích hợp
                  </div>
                </div>
              `
            : html`
                <div class="api-key-list">
                  ${apiKeys.map(
                    (key) => html`
                      <div class="api-key-item">
                        <div class="api-key-icon">${icons.key}</div>
                        <div class="api-key-info">
                          <div class="api-key-name">${key.name}</div>
                          <div class="api-key-value">${key.key}</div>
                          <div class="api-key-date">
                            Tạo lúc ${formatDate(key.createdAt)}
                          </div>
                        </div>
                        <div class="api-key-actions">
                          <button
                            class="api-key-btn"
                            title="Sao chép"
                            @click=${() => props.onCopyKey?.(key.key)}
                          >
                            ${icons.copy}
                          </button>
                          <button
                            class="api-key-btn danger"
                            title="Xóa"
                            @click=${() => props.onDeleteKey?.(key.id)}
                          >
                            ${icons.trash}
                          </button>
                        </div>
                      </div>
                    `,
                  )}
                </div>
              `}
        </div>
      </div>
    </div>

    <operis-modal
      ?open=${showCreateKeyModal}
      title="Tạo API Key"
      @close=${() => props.onCloseCreateKeyModal?.()}
    >
      <div class="modal-field">
        <label class="modal-label">Tên Key</label>
        <operis-input
          type="text"
          placeholder="VD: Production, Development..."
          .value=${newKeyName}
          @input=${(e: CustomEvent) =>
            props.onNewKeyNameChange?.(e.detail.value)}
        ></operis-input>
      </div>
      <div slot="footer">
        <button
          class="modal-btn modal-btn-secondary"
          @click=${() => props.onCloseCreateKeyModal?.()}
        >
          Hủy
        </button>
        <button
          class="modal-btn modal-btn-primary"
          ?disabled=${!newKeyName.trim()}
          @click=${() => props.onCreateKey?.()}
        >
          Tạo
        </button>
      </div>
    </operis-modal>

    <operis-modal ?open=${showQrModal} @close=${() => props.onCloseQrModal?.()}>
      <div class="qr-payment">
        <div class="qr-payment-title">Chuyển khoản ngân hàng</div>
        ${pendingOrder?.paymentInfo
          ? html`
              ${pendingOrder.paymentInfo.qrCodeUrl
                ? html`
                    <div class="qr-image-container">
                      <img
                        class="qr-image"
                        src="${pendingOrder.paymentInfo.qrCodeUrl}"
                        alt="QR Code"
                      />
                    </div>
                  `
                : nothing}
              <div class="qr-bank-info">
                <div class="qr-bank-row">
                  <span class="qr-bank-label">Ngân hàng</span>
                  <span class="qr-bank-value"
                    >${pendingOrder.paymentInfo.bankName}</span
                  >
                </div>
                <div class="qr-bank-row">
                  <span class="qr-bank-label">Số tài khoản</span>
                  <span class="qr-bank-value"
                    >${pendingOrder.paymentInfo.accountNumber}</span
                  >
                </div>
                <div class="qr-bank-row">
                  <span class="qr-bank-label">Tên tài khoản</span>
                  <span class="qr-bank-value"
                    >${pendingOrder.paymentInfo.accountName}</span
                  >
                </div>
                <div class="qr-bank-row">
                  <span class="qr-bank-label">Số tiền</span>
                  <span class="qr-bank-value highlight"
                    >${formatVND(pendingOrder.amount)}</span
                  >
                </div>
                <div class="qr-bank-row">
                  <span class="qr-bank-label">Nội dung CK</span>
                  <span class="qr-bank-value highlight"
                    >${pendingOrder.paymentInfo.transferContent}</span
                  >
                </div>
              </div>
              <div class="qr-note">
                Chuyển khoản ĐÚNG số tiền và nội dung. Token sẽ được cộng tự
                động trong 1-5 phút sau khi thanh toán thành công.
              </div>
            `
          : html`
              <div class="history-empty">Không có thông tin thanh toán</div>
            `}
        <button
          class="qr-check-btn"
          ?disabled=${checkingTransaction}
          @click=${() => props.onCheckTransaction?.()}
        >
          ${checkingTransaction
            ? "Đang kiểm tra..."
            : "Kiểm tra kết quả giao dịch"}
        </button>
        <button class="qr-cancel-btn" @click=${() => props.onCancelPending?.()}>
          Hủy đơn nạp
        </button>
      </div>
    </operis-modal>

    <!-- Detail Modal -->
    <operis-modal
      ?open=${showDetailModal}
      title="Chi tiết giao dịch"
      @close=${() => props.onCloseDetailModal?.()}
    >
      ${detailLoading
        ? html`<div class="detail-loading">Đang tải...</div>`
        : selectedDeposit
          ? html`
              <div class="detail-modal">
                <div class="detail-header">
                  <span class="detail-order-code">${selectedDeposit.orderCode}</span>
                  <span class="detail-status ${getStatusClass(selectedDeposit.status)}">
                    ${getStatusLabel(selectedDeposit.status)}
                  </span>
                </div>

                <div class="detail-amount-section">
                  <div class="detail-amount">${formatVND(selectedDeposit.amount)}</div>
                  <div class="detail-tokens">+${formatNumber(selectedDeposit.tokens)} tokens</div>
                </div>

                <div class="detail-info-grid">
                  <div class="detail-info-row">
                    <span class="detail-info-label">${icons.calendar} Ngày tạo</span>
                    <span class="detail-info-value">${formatDate(selectedDeposit.createdAt)}</span>
                  </div>
                  ${selectedDeposit.completedAt
                    ? html`
                        <div class="detail-info-row">
                          <span class="detail-info-label">${icons.check} Hoàn thành</span>
                          <span class="detail-info-value">${formatDate(selectedDeposit.completedAt)}</span>
                        </div>
                      `
                    : nothing}
                  <div class="detail-info-row">
                    <span class="detail-info-label">${icons.clock} Hết hạn</span>
                    <span class="detail-info-value">${formatDate(selectedDeposit.expiresAt)}</span>
                  </div>
                </div>

                ${selectedDeposit.paymentInfo?.bankName
                  ? html`
                      <div class="detail-payment-section">
                        <div class="detail-payment-header">
                          ${icons.creditCard} Thông tin thanh toán
                        </div>
                        <div class="detail-payment-body">
                          <div class="detail-payment-row">
                            <span class="detail-payment-label">Ngân hàng</span>
                            <span class="detail-payment-value">${selectedDeposit.paymentInfo.bankName}</span>
                          </div>
                          <div class="detail-payment-row">
                            <span class="detail-payment-label">Số tài khoản</span>
                            <span class="detail-payment-value">${selectedDeposit.paymentInfo.accountNumber}</span>
                          </div>
                          <div class="detail-payment-row">
                            <span class="detail-payment-label">Tên TK</span>
                            <span class="detail-payment-value">${selectedDeposit.paymentInfo.accountName}</span>
                          </div>
                          <div class="detail-payment-row">
                            <span class="detail-payment-label">Nội dung CK</span>
                            <span class="detail-payment-value">${selectedDeposit.paymentInfo.transferContent}</span>
                          </div>
                        </div>
                      </div>
                    `
                  : nothing}

                <button class="detail-close-btn" @click=${() => props.onCloseDetailModal?.()}>
                  Đóng
                </button>
              </div>
            `
          : html`<div class="history-empty">Không có thông tin</div>`}
    </operis-modal>
  `;
}
