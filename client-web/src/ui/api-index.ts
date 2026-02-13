/**
 * API Index
 * Re-exports all API modules for convenient importing
 */

// Authentication
export {
  login,
  logout,
  refreshTokens,
  getMe,
  restoreSession,
  getAccessToken,
  getRefreshToken,
  isAuthenticated,
  apiRequest,
  type AuthUser,
  type AuthResult,
} from "./auth-api";

// Chat
export {
  sendMessage,
  sendMessageSync,
  getChatBalance,
  getConversations,
  getConversationHistory,
  newConversation,
  deleteConversation,
  extractTextContent,
  type ChatMessage,
  type ChatResult,
  type ChatOptions,
  type ContentBlock,
  type Conversation,
  type HistoryMessage,
} from "./chat-api";

// User Profile
export {
  getUserProfile,
  updateUserProfile,
  changePassword,
  type UserProfile,
} from "./user-api";

// Tokens
export {
  getTokenBalance,
  getTransactions,
  adminCreditTokens,
  adminDebitTokens,
  adminAdjustTokens,
  type TokenBalance,
  type TokenTransaction,
  type TransactionsResponse,
} from "./tokens-api";

// API Keys
export {
  listApiKeys,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  adminListAllKeys,
  type ApiKey,
  type ApiKeyCreateResponse,
  type ApiKeysListResponse,
} from "./api-keys-api";

// Deposits/Payments
export {
  getPricing,
  createDeposit,
  getPendingDeposit,
  getDeposit,
  cancelDeposit,
  getDepositHistory,
  getTokenHistory,
  pollDepositStatus,
  type PricingTier,
  type PricingResponse,
  type PaymentInfo,
  type DepositOrder,
  type CreateDepositRequest,
  type DepositHistoryResponse,
  type TokenTransaction,
  type TokenHistoryResponse,
} from "./deposits-api";

// Analytics
export {
  getUsageOverview,
  getDailyUsage,
  getRangeUsage,
  getUsageHistory,
  transformDailyUsage,
  transformTypeUsage,
  transformStats,
  type ApiStats,
  type ApiByType,
  type ApiDaily,
  type UsageOverviewResponse,
  type DailyUsageResponse,
  type RangeUsageResponse,
  type HistoryResponse,
  type UsageRecord,
  type DailyUsage,
  type TypeUsage,
  type UsageStats,
} from "./analytics-api";

// Workflows (Cron Jobs)
export {
  listWorkflows,
  createWorkflow,
  toggleWorkflow,
  runWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  getWorkflowStatus,
  type WorkflowRun,
  type WorkflowStatus,
} from "./workflow-api";
