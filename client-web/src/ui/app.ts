import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import { icons } from "./icons";
import { showToast } from "./components/operis-toast";
import { NAV_ITEMS, pathForTab, tabFromPath, type Tab } from "./navigation";
import { loadSettings, saveSettings, type ClientSettings } from "./storage";
import {
  resolveTheme,
  applyTheme,
  getSystemTheme,
  type ThemeMode,
  type ResolvedTheme,
} from "./theme";
import {
  startThemeTransition,
  type ThemeTransitionContext,
} from "./theme-transition";
import { t } from "./i18n";
import { renderChat } from "./views/chat";
import { renderBilling } from "./views/billing";
import { renderLogs, type LogEntry } from "./views/logs";
import { renderWorkflow } from "./views/workflow";
import { renderDocs } from "./views/docs";
import { renderLogin } from "./views/login";
import { renderChannels } from "./views/channels";
import { renderSettings } from "./views/settings";
import { renderAgents } from "./views/agents";
import { renderSkills } from "./views/skills";
import { renderNodes } from "./views/nodes";
import { renderAnalytics } from "./views/analytics";
import type {
  AgentsListResult,
  AgentFileEntry,
  AgentsFilesListResult,
  AgentIdentityResult,
  SkillStatusReport,
  SkillMessageMap,
  DevicePairingList,
  PendingDevice,
  PairedDevice,
  NodeInfo,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
} from "./agent-types";
import type { Workflow, WorkflowFormState } from "./workflow-types";
import { DEFAULT_WORKFLOW_FORM } from "./workflow-types";
import {
  listWorkflows,
  createWorkflow,
  toggleWorkflow,
  runWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  getWorkflowStatus,
  type WorkflowStatus,
} from "./workflow-api";
import { subscribeToCronEvents, subscribeToChatStream, stopGatewayClient, waitForConnection, type CronEvent, type ChatStreamEvent } from "./gateway-client";
import { startUsageTracker, stopUsageTracker, reportSSEUsage } from "./usage-tracker";
import {
  login as authLogin,
  logout as authLogout,
  restoreSession,
  pullAndSyncAuthProfiles,
  clearLocalAuthProfiles,
  provisionAndStartTunnel,
  type AuthUser,
} from "./auth-api";
import {
  sendMessage as sendChatMessage,
  extractTextContent,
  getConversations,
  getConversationHistory,
  deleteConversation,
  type Conversation,
} from "./chat-api";
import {
  getChannelsStatus,
  connectChannel,
  disconnectChannel,
  CHANNEL_DEFINITIONS,
  type ChannelStatus,
  type ChannelId,
} from "./channels-api";
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  type UserProfile,
} from "./user-api";
import {
  getDailyUsage,
  getRangeUsage,
  transformDailyUsage,
  transformTypeUsage,
  transformStats,
  type DailyUsage,
  type TypeUsage,
  type UsageStats,
} from "./analytics-api";
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

// Register custom components
import "./components/operis-input";
import "./components/operis-select";
import "./components/operis-modal";
import "./components/operis-datetime-picker";
import "./components/operis-confirm";
import { showConfirm } from "./components/operis-confirm";

// Get page title
function titleForTab(tab: Tab): string {
  const titles: Record<Tab, string> = {
    chat: "Trò Chuyện",
    analytics: "Phân Tích",
    workflow: "Luồng Công Việc",
    billing: "Thanh Toán",
    logs: "Nhật Ký",
    docs: "Tài Liệu",
    channels: "Kênh Kết Nối",
    settings: "Cài Đặt",
    login: "Đăng Nhập",
    agents: "Agents",
    skills: "Skills",
    nodes: "Nodes",
  };
  return titles[tab] ?? tab;
}

// Get page subtitle
function subtitleForTab(tab: Tab): string {
  const subtitles: Record<Tab, string> = {
    chat: "Phiên chat trực tiếp với gateway",
    analytics: "Xem thống kê sử dụng và chi phí",
    workflow: "Tự động hóa tác vụ với AI theo lịch",
    billing: "Xem sử dụng và quản lý gói",
    logs: "Xem nhật ký hệ thống",
    docs: "Hướng dẫn sử dụng",
    channels: "Kết nối ứng dụng nhắn tin",
    settings: "Cài đặt tài khoản và tùy chọn",
    login: "Truy cập tài khoản của bạn",
    agents: "Quản lý agents và workspace",
    skills: "Quản lý skills và cài đặt",
    nodes: "Thiết bị và node kết nối",
  };
  return subtitles[tab] ?? "";
}

@customElement("operis-app")
export class OperisApp extends LitElement {
  @state() settings: ClientSettings = loadSettings();
  @state() tab: Tab = "chat";
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";

  // Chat state
  @state() chatMessages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: Date;
  }> = [];
  @state() chatDraft = "";
  @state() chatSending = false;
  @state() chatConversationId: string | null = null;
  @state() chatError: string | null = null;
  @state() chatHistoryLoaded = false;
  @state() chatInitializing = true;
  // Streaming state
  @state() chatStreamingText = "";
  @state() chatStreamingRunId: string | null = null;
  // Session token tracking
  @state() chatSessionTokens = 0;
  @state() chatTokenBalance = 0;
  // Abort controller for stopping chat stream
  private chatAbortController: AbortController | null = null;
  // Chat sidebar state
  @state() chatConversations: Conversation[] = [];
  @state() chatConversationsLoading = false;
  // Login state
  @state() loginLoading = false;
  @state() loginError: string | null = null;
  @state() currentUser: AuthUser | null = null;

  // Workflow state
  @state() workflows: Workflow[] = [];
  @state() workflowLoading = false;
  @state() workflowError: string | null = null;
  @state() workflowForm: WorkflowFormState = { ...DEFAULT_WORKFLOW_FORM };
  @state() workflowSaving = false;
  @state() workflowExpandedId: string | null = null;
  @state() runningWorkflowIds: Set<string> = new Set();
  @state() workflowStatus: WorkflowStatus | null = null;
  // Run history state
  @state() workflowRunsId: string | null = null;
  @state() workflowRuns: Array<{ ts: number; status: string; summary?: string; durationMs?: number; error?: string }> = [];
  @state() workflowRunsLoading = false;

  // Logs state
  @state() logsEntries: LogEntry[] = [];
  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsSearchQuery = "";
  @state() logsHasMore = false;

  // Docs state
  @state() docsSelectedSlug: string | null = null;

  // Billing state (token balance comes from currentUser.token_balance)
  @state() billingPaymentMode: "tier" | "amount" = "tier";
  @state() billingSelectedPackage = 0;
  @state() billingCustomAmount = "";
  @state() billingAutoTopUp = false;
  @state() billingPricingTiers: PricingTier[] = [];
  @state() billingPricingLoading = false;
  @state() billingPendingOrder: DepositOrder | null = null;
  @state() billingDepositHistory: DepositOrder[] = [];
  @state() billingHistoryLoading = false;
  @state() billingHistoryPage = 1;
  private readonly billingHistoryPageSize = 5;
  @state() billingBuyLoading = false;
  @state() billingCheckingTransaction = false;
  @state() billingShowQrModal = false;
  @state() billingShowDetailModal = false;
  @state() billingSelectedDeposit: import("./deposits-api").DepositOrder | null = null;
  @state() billingDetailLoading = false;
  @state() billingApiKeys: Array<{
    id: string;
    name: string;
    key: string;
    createdAt: number;
  }> = [];
  @state() billingShowCreateKeyModal = false;
  @state() billingNewKeyName = "";

  // Channels state
  @state() channels: ChannelStatus[] = [];
  @state() channelsLoading = false;
  @state() channelsError: string | null = null;
  @state() channelsConnecting: ChannelId | null = null;

  // Settings state
  @state() userProfile: UserProfile | null = null;
  @state() settingsLoading = false;
  @state() settingsSaving = false;
  @state() settingsError: string | null = null;
  @state() settingsSuccess: string | null = null;
  @state() settingsEditingName = false;
  @state() settingsNameValue = "";
  @state() settingsShowPasswordForm = false;

  // Agents state
  @state() agentsLoading = false;
  @state() agentsError: string | null = null;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentSelectedId: string | null = null;
  @state() agentActivePanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" = "overview";
  // Agent config state
  @state() agentConfigForm: Record<string, unknown> | null = null;
  @state() agentConfigLoading = false;
  @state() agentConfigSaving = false;
  @state() agentConfigDirty = false;
  // Agent files state
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileActive: string | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileSaving = false;
  // Agent identity state
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  // Agent channels state
  @state() agentChannelsLoading = false;
  @state() agentChannelsError: string | null = null;
  @state() agentChannelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() agentChannelsLastSuccess: number | null = null;
  // Agent cron state
  @state() agentCronLoading = false;
  @state() agentCronError: string | null = null;
  @state() agentCronStatus: CronStatus | null = null;
  @state() agentCronJobs: CronJob[] = [];
  // Agent skills state (per-agent, separate from global skills tab)
  @state() agentSkillsLoading = false;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsAgentId: string | null = null;
  @state() agentSkillsFilter = "";

  // Skills state
  @state() skillsLoading = false;
  @state() skillsError: string | null = null;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsFilter = "";
  @state() skillsEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillsMessages: SkillMessageMap = {};

  // Nodes state
  @state() nodesLoading = false;
  @state() nodesList: NodeInfo[] = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;

  // Config state (for bindings)
  @state() configForm: Record<string, unknown> | null = null;
  @state() configLoading = false;
  @state() configSaving = false;
  @state() configDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSnapshot: { hash: string; config: Record<string, unknown> } | null = null;

  // Exec approvals state
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: import("./agent-types").ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: import("./agent-types").ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;

  // Analytics state
  @state() analyticsLoading = false;
  @state() analyticsError: string | null = null;
  @state() analyticsStats: UsageStats | null = null;
  @state() analyticsDailyUsage: DailyUsage[] = [];
  @state() analyticsTypeUsage: TypeUsage[] = [];
  @state() analyticsPeriod: "1d" | "7d" | "30d" | "90d" | "custom" = "30d";
  @state() analyticsRangeStart = "";
  @state() analyticsRangeEnd = "";

  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null =
    null;
  private popStateHandler = () => this.handlePopState();
  private clickOutsideHandler = () => { this.tokenDropdownOpen = false; };
  private sessionExpiredHandler: (() => void) | null = null;
  private cronEventUnsubscribe: (() => void) | null = null;
  private chatStreamUnsubscribe: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Initialize theme
    this.themeResolved = resolveTheme(this.theme);
    applyTheme(this.themeResolved);

    // Listen for system theme changes
    if (this.theme === "system" && typeof window !== "undefined") {
      this.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
      this.themeMediaHandler = () => {
        if (this.theme === "system") {
          this.themeResolved = getSystemTheme();
          applyTheme(this.themeResolved);
        }
      };
      this.themeMedia.addEventListener("change", this.themeMediaHandler);
    }

    // Initialize tab from URL (don't load protected data yet — wait for auth)
    let initialTab = tabFromPath(window.location.pathname);
    if ((initialTab === "login") && this.settings.isLoggedIn) {
      initialTab = "chat";
      window.history.replaceState({}, "", pathForTab("chat"));
    }
    if (initialTab) {
      this.tab = initialTab;
    }

    // Listen for browser navigation
    window.addEventListener("popstate", this.popStateHandler);
    // Close token dropdown on outside click
    document.addEventListener("click", this.clickOutsideHandler);

    // Subscribe to cron events for real-time workflow updates
    this.cronEventUnsubscribe = subscribeToCronEvents((evt: CronEvent) => {
      this.handleCronEvent(evt);
    });

    // Subscribe to chat stream events for real-time message streaming
    this.chatStreamUnsubscribe = subscribeToChatStream((evt: ChatStreamEvent) => {
      this.handleChatStreamEvent(evt);
    });

    // Start usage tracker - reports token usage from WS to Operis BE
    startUsageTracker();

    // Listen for session expiry (fired by api-client interceptor when refresh fails)
    this.sessionExpiredHandler = () => {
      clearLocalAuthProfiles();
      this.resetToLoggedOut();
    };
    window.addEventListener("auth:session-expired", this.sessionExpiredHandler);

    // Try to restore session from stored tokens
    this.tryRestoreSession();
  }

  private handleCronEvent(evt: CronEvent) {
    // Track running workflows
    if (evt.action === "started") {
      this.runningWorkflowIds = new Set([...this.runningWorkflowIds, evt.jobId]);
    } else if (evt.action === "finished") {
      const newSet = new Set(this.runningWorkflowIds);
      newSet.delete(evt.jobId);
      this.runningWorkflowIds = newSet;
    }

    // Auto-refresh workflows when on workflow tab (silent - no loading indicator)
    if (this.tab === "workflow") {
      // Debounce: only refresh if not already loading
      if (!this.workflowLoading) {
        this.loadWorkflows(true);
      }
    }
  }

  private handleChatStreamEvent(evt: ChatStreamEvent) {
    // Only process events if we're actively sending AND using WebSocket streaming (not SSE)
    // SSE streaming sets chatStreamingRunId = "sse-stream", skip WebSocket events in that case
    if (!this.chatSending || this.chatStreamingRunId === "sse-stream") return;

    if (evt.state === "delta" && evt.message?.content) {
      // Extract text from content blocks
      const text = evt.message.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("");

      this.chatStreamingText = text;
      this.chatStreamingRunId = evt.runId;
      // Don't scroll during streaming - user message stays at top
    } else if (evt.state === "final") {
      // Final message received - add to messages and clear streaming state
      const finalText = evt.message?.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("") || this.chatStreamingText;

      if (finalText) {
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", content: finalText, timestamp: new Date() },
        ];
      }

      // Accumulate WS token usage
      const wsUsage = evt.usage ?? evt.message?.usage;
      if (wsUsage) {
        this.chatSessionTokens += wsUsage.totalTokens || ((wsUsage.input || 0) + (wsUsage.output || 0)) || 0;
      }

      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatSending = false;
      // Don't scroll here - user message is already at top
    } else if (evt.state === "error") {
      // Error occurred - show error message
      const errorMsg = evt.errorMessage || "Có lỗi xảy ra khi xử lý tin nhắn";
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date() },
      ];
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatSending = false;
      // Don't scroll here - user message is already at top
    }
  }

  private async tryRestoreSession() {
    try {
      const user = await restoreSession();
      if (user) {
        this.currentUser = user;
        this.chatTokenBalance = user.token_balance ?? 0;
        this.applySettings({
          ...this.settings,
          isLoggedIn: true,
          username: user.name,
        });
        // Sync auth profiles from token vault on session restore
        pullAndSyncAuthProfiles();
        // Auto-provision tunnel if in Electron and not yet provisioned
        provisionAndStartTunnel();
        // Redirect from login page if logged in
        if (this.tab === "login") {
          this.chatInitializing = true;
          this.setTab("chat");
        } else {
          // Load data for current tab now that we're authenticated
          this.loadTabData(this.tab);
        }
      } else {
        // No session - reset login state
        this.resetToLoggedOut();
      }
    } catch {
      // Session restore failed - reset login state
      this.resetToLoggedOut();
    }
  }

  private startGatewayServices() {
    // Subscribe to cron events for real-time workflow updates
    if (!this.cronEventUnsubscribe) {
      this.cronEventUnsubscribe = subscribeToCronEvents((evt: CronEvent) => {
        this.handleCronEvent(evt);
      });
    }
    // Subscribe to chat stream events for real-time message streaming
    if (!this.chatStreamUnsubscribe) {
      this.chatStreamUnsubscribe = subscribeToChatStream((evt: ChatStreamEvent) => {
        this.handleChatStreamEvent(evt);
      });
    }
    startUsageTracker();
  }

  private stopGatewayServices() {
    this.cronEventUnsubscribe?.();
    this.cronEventUnsubscribe = null;
    this.chatStreamUnsubscribe?.();
    this.chatStreamUnsubscribe = null;
    stopUsageTracker();
    stopGatewayClient();
  }

  private loadTabData(tab: string) {
    if (tab === "chat") {
      this.loadChatHistory();
      this.scrollChatToBottom();
    } else if (tab === "workflow") {
      this.loadWorkflows();
    } else if (tab === "channels") {
      this.loadChannels();
    } else if (tab === "settings") {
      this.loadUserProfile();
      this.loadChannels();
    } else if (tab === "agents") {
      this.loadAgents();
    } else if (tab === "skills") {
      this.loadSkills();
    } else if (tab === "nodes") {
      this.loadNodes();
      this.loadDevices();
    } else if (tab === "analytics") {
      this.loadAnalytics();
    } else if (tab === "billing") {
      this.loadBillingData();
    } else if (tab === "logs") {
      this.loadLogs();
    }
  }

  private resetToLoggedOut() {
    // Stop gateway WS connection
    this.stopGatewayServices();
    this.currentUser = null;
    // Reset chat state
    this.chatMessages = [];
    this.chatConversationId = null;
    this.chatSessionTokens = 0;
    this.chatTokenBalance = 0;
    this.chatHistoryLoaded = false;
    this.chatInitializing = false;
    // Reset settings
    this.applySettings({
      ...this.settings,
      isLoggedIn: false,
      username: null,
    });
    // Redirect to login if on protected page
    if (this.protectedTabs.includes(this.tab)) {
      this.tab = "login";
      window.history.replaceState({}, "", pathForTab("login"));
    }
  }

  disconnectedCallback() {
    if (this.themeMedia && this.themeMediaHandler) {
      this.themeMedia.removeEventListener("change", this.themeMediaHandler);
    }
    window.removeEventListener("popstate", this.popStateHandler);
    document.removeEventListener("click", this.clickOutsideHandler);
    if (this.sessionExpiredHandler) {
      window.removeEventListener("auth:session-expired", this.sessionExpiredHandler);
    }
    this.stopGatewayServices();
    super.disconnectedCallback();
  }

  private readonly protectedTabs = ["chat", "workflow", "channels", "settings", "agents", "skills", "nodes", "analytics", "billing", "logs"];

  private handlePopState() {
    let tab = tabFromPath(window.location.pathname);
    if ((tab === "login") && this.settings.isLoggedIn) {
      tab = "chat";
      window.history.replaceState({}, "", pathForTab("chat"));
    }
    // Redirect to login if not logged in and on protected page
    if (tab && this.protectedTabs.includes(tab) && !this.settings.isLoggedIn) {
      tab = "login";
      window.history.replaceState({}, "", pathForTab("login"));
    }
    if (tab) {
      this.setTab(tab);
    }
  }

  private setTab(tab: Tab) {
    if ((tab === "login") && this.settings.isLoggedIn) {
      tab = "chat";
    }
    // Block protected tabs when not logged in
    if (this.protectedTabs.includes(tab) && !this.settings.isLoggedIn) {
      tab = "login";
    }
    if (tab === this.tab) return;
    this.tab = tab;
    const path = pathForTab(tab);
    window.history.pushState({}, "", path);

    this.loadTabData(tab);
  }

  private async loadChatHistory() {
    // Skip if not logged in or already loaded
    if (!this.settings.isLoggedIn || this.chatHistoryLoaded) {
      this.chatInitializing = false;
      return;
    }

    try {
      // Load sidebar conversation list only — show welcome state (like ChatGPT/Gemini)
      const { conversations } = await getConversations();
      conversations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      this.chatConversations = conversations;
      this.chatHistoryLoaded = true;
    } catch (err) {
      console.error("[chat] Failed to load history:", err);
      // Don't show error to user, just start fresh
    } finally {
      this.chatInitializing = false;
    }
  }

  private updateDynamicSpacer(active: boolean = true) {
    const messagesEl = this.renderRoot.querySelector(".gc-messages") as HTMLElement;
    const spacer = this.renderRoot.querySelector(".gc-scroll-spacer") as HTMLElement;
    if (!messagesEl || !spacer) return;

    if (!active) {
      spacer.style.height = "0px";
      return;
    }

    const userMessages = messagesEl.querySelectorAll(".gc-message--user");
    const lastUserMsg = userMessages[userMessages.length - 1] as HTMLElement;
    if (!lastUserMsg) {
      spacer.style.height = "0px";
      return;
    }

    // Reset spacer to measure true content height
    spacer.style.height = "0px";

    // Use getBoundingClientRect for reliable position in flex layout
    const containerRect = messagesEl.getBoundingClientRect();
    const msgRect = lastUserMsg.getBoundingClientRect();
    const targetScrollTop = messagesEl.scrollTop + (msgRect.top - containerRect.top) - 24;
    const neededScrollHeight = targetScrollTop + messagesEl.clientHeight;
    const spacerHeight = Math.max(0, neededScrollHeight - messagesEl.scrollHeight);
    spacer.style.height = `${spacerHeight}px`;
    messagesEl.scrollTop = targetScrollTop;
  }

  private async scrollChatToBottom() {
    await this.updateComplete;
    await new Promise((r) => requestAnimationFrame(r));

    const messagesEl = this.renderRoot.querySelector(".gc-messages") as HTMLElement;
    if (!messagesEl) return;

    const userMessages = messagesEl.querySelectorAll(".gc-message--user");
    const lastUserMsg = userMessages[userMessages.length - 1] as HTMLElement;

    if (!lastUserMsg) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    // Set generous spacer first to guarantee scroll room
    const spacer = messagesEl.querySelector(".gc-scroll-spacer") as HTMLElement;
    if (spacer) spacer.style.height = `${messagesEl.clientHeight}px`;

    await new Promise((r) => requestAnimationFrame(r));

    // Use getBoundingClientRect for reliable scroll calc in flex containers
    const containerRect = messagesEl.getBoundingClientRect();
    const msgRect = lastUserMsg.getBoundingClientRect();
    messagesEl.scrollTop += msgRect.top - containerRect.top - 24;

    // Shrink spacer to exact needed size (avoid excess empty space on history load)
    if (spacer) {
      const currentSpacerH = parseFloat(spacer.style.height) || 0;
      const contentWithoutSpacer = messagesEl.scrollHeight - currentSpacerH;
      const neededTotal = messagesEl.scrollTop + messagesEl.clientHeight;
      spacer.style.height = `${Math.max(0, neededTotal - contentWithoutSpacer)}px`;
    }
  }

  private setTheme(mode: ThemeMode, context?: ThemeTransitionContext) {
    const currentTheme = this.theme;
    startThemeTransition({
      nextTheme: mode,
      currentTheme,
      context,
      applyTheme: () => {
        this.theme = mode;
        this.themeResolved = resolveTheme(mode);
        applyTheme(this.themeResolved);
        this.applySettings({ ...this.settings, theme: mode });
      },
    });
  }

  private applySettings(next: ClientSettings) {
    this.settings = next;
    saveSettings(next);
  }

  private toggleNav() {
    this.applySettings({
      ...this.settings,
      navCollapsed: !this.settings.navCollapsed,
    });
  }

  private async handleLogin(email: string, password: string) {
    this.loginLoading = true;
    this.loginError = null;

    try {
      const result = await authLogin(email, password);
      this.currentUser = result.user;
      this.applySettings({
        ...this.settings,
        isLoggedIn: true,
        username: result.user.name,
      });
      // Pull auth profiles from token vault and sync to local gateway
      pullAndSyncAuthProfiles();
      // Start cloudflared and wait for tunnel connection before proceeding
      await provisionAndStartTunnel(result.tunnel?.tunnelToken);
      // Redirect with gateway token so WS client can pick it up
      if (result.user.gateway_token) {
        window.location.href = `/?token=${encodeURIComponent(result.user.gateway_token)}`;
        return;
      }
      // Reset chat state for fresh load
      this.chatInitializing = true;
      this.chatHistoryLoaded = false;
      this.setTab("chat");
    } catch (err) {
      this.loginError =
        err instanceof Error ? err.message : "Đăng nhập thất bại";
    } finally {
      this.loginLoading = false;
    }
  }


  private async handleLogout() {
    try {
      await authLogout();
    } catch {
      // Ignore logout errors
    }
    clearLocalAuthProfiles();
    this.resetToLoggedOut();
  }

  private async handleSendMessage() {
    if (!this.chatDraft.trim() || this.chatSending) return;

    const userMessage = this.chatDraft.trim();
    const isNewConversation = !this.chatConversationId;
    this.chatDraft = "";
    this.chatSending = true;
    this.chatError = null;
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatAbortController = new AbortController();

    // Add user message
    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", content: userMessage, timestamp: new Date() },
    ];
    // Scroll user message to top of viewport before streaming starts
    await this.scrollChatToBottom();

    try {
      // Call real Operis Chat API with SSE streaming
      const result = await sendChatMessage(
        userMessage,
        this.chatConversationId ?? undefined,
        // onDelta - update streaming text as chunks arrive
        (text: string) => {
          this.chatStreamingText = text;
          this.chatStreamingRunId = "sse-stream";
          // Spacer stays at viewport height (set by scrollChatToBottom before streaming).
          // overflow-anchor:none keeps scroll position stable as content grows.
        },
        // onDone - mark streaming complete
        () => {
          // Will be handled below when result arrives
        },
        this.chatAbortController?.signal,
      );

      // Store conversation ID for context
      this.chatConversationId = result.conversationId;

      // Update sidebar: new conversation → full refresh, existing → move to top
      if (isNewConversation) {
        this.loadConversationList();
      } else {
        // Move current conversation to top of sidebar list
        const convId = result.conversationId;
        const idx = this.chatConversations.findIndex((c) => c.conversation_id === convId);
        if (idx > 0) {
          const updated = [...this.chatConversations];
          const [conv] = updated.splice(idx, 1);
          conv.last_message = userMessage;
          updated.unshift(conv);
          this.chatConversations = updated;
        }
      }

      // Report token usage from SSE response to Operis BE
      console.log("[app] SSE result.usage:", result.usage, "balance:", result.tokenBalance);
      if (result.usage) {
        reportSSEUsage(result.usage);
        const usedTokens = result.usage.totalTokens || ((result.usage.input || 0) + (result.usage.output || 0));
        this.chatSessionTokens += usedTokens || 0;
      }
      if (result.tokenBalance !== undefined) {
        this.chatTokenBalance = result.tokenBalance;
        // Sync to currentUser so analytics/billing tabs show updated balance
        if (this.currentUser) {
          this.currentUser = { ...this.currentUser, token_balance: result.tokenBalance };
        }
      }

      // Get final text before clearing state
      const assistantText = extractTextContent(result.content) || this.chatStreamingText;

      // Clear streaming state FIRST to stop showing streaming bubble
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatSending = false;

      // Then add final message
      if (assistantText) {
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", content: assistantText, timestamp: new Date() },
        ];
      }
      // Recalculate spacer to exact needed size (user msg stays at top, no excess space)
      await this.updateComplete;
      this.updateDynamicSpacer(true);
    } catch (err) {
      // User aborted — keep whatever was streamed so far as the final message
      if (err instanceof DOMException && err.name === "AbortError") {
        const partialText = this.chatStreamingText;
        this.chatStreamingText = "";
        this.chatStreamingRunId = null;
        this.chatSending = false;
        this.chatAbortController = null;
        if (partialText) {
          this.chatMessages = [
            ...this.chatMessages,
            { role: "assistant", content: partialText, timestamp: new Date() },
          ];
        }
        await this.updateComplete;
        this.updateDynamicSpacer(true);
        return;
      }

      let errorMsg =
        err instanceof Error ? err.message : "Không thể gửi tin nhắn";

      // Strip any HTML that leaked through (Cloudflare, nginx error pages, etc.)
      if (/<[a-z][\s\S]*>/i.test(errorMsg)) {
        errorMsg = "Gateway không khả dụng. Vui lòng thử lại sau.";
      }

      // User-friendly error messages
      let displayError: string;
      if (errorMsg.includes("503") || errorMsg.includes("unavailable") || errorMsg.includes("không khả dụng")) {
        displayError =
          "Dịch vụ chat tạm thời không khả dụng. Vui lòng thử lại sau.";
      } else if (
        errorMsg.includes("401") ||
        errorMsg.includes("Unauthorized")
      ) {
        displayError = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
      } else if (
        errorMsg.includes("insufficient") ||
        errorMsg.includes("balance")
      ) {
        displayError = "Số dư token không đủ. Vui lòng nạp thêm.";
      } else {
        displayError = errorMsg;
      }

      this.chatError = displayError;
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", content: `⚠️ ${displayError}`, timestamp: new Date() },
      ];
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatSending = false;
      this.chatAbortController = null;
      // Don't scroll - user message stays at top
    }
  }

  private handleStopChat() {
    if (this.chatAbortController) {
      this.chatAbortController.abort();
      this.chatAbortController = null;
    }
  }

  // --- Chat sidebar handlers ---

  private toggleChatSidebar() {
    this.applySettings({
      ...this.settings,
      chatSidebarCollapsed: !this.settings.chatSidebarCollapsed,
    });
  }

  private async loadConversationList() {
    this.chatConversationsLoading = true;
    try {
      const { conversations } = await getConversations();
      conversations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      this.chatConversations = conversations;
    } catch (err) {
      console.error("[chat] Failed to load conversations:", err);
    } finally {
      this.chatConversationsLoading = false;
    }
  }

  private handleNewConversation() {
    this.chatConversationId = null;
    this.chatMessages = [];
    this.chatSessionTokens = 0;
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatSending = false;
    this.chatError = null;
  }

  private async handleSwitchConversation(conversationId: string) {
    if (conversationId === this.chatConversationId) return;

    this.chatConversationId = conversationId;
    this.chatMessages = [];
    this.chatInitializing = true;
    this.chatSessionTokens = 0;
    this.chatError = null;

    try {
      const { messages, usage } = await getConversationHistory(conversationId);
      this.chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.created_at ? new Date(m.created_at) : undefined,
      }));
      if (usage?.total_tokens) {
        this.chatSessionTokens = usage.total_tokens;
      }
      this.scrollChatToBottom();
    } catch (err) {
      console.error("[chat] Failed to load conversation:", err);
      this.chatError = "Không thể tải hội thoại";
    } finally {
      this.chatInitializing = false;
    }
  }

  private async handleDeleteConversation(conversationId: string) {
    const confirmed = await showConfirm({
      title: "Xóa hội thoại?",
      message: "Bạn có chắc muốn xóa cuộc hội thoại này?",
      confirmText: "Xóa",
      cancelText: "Hủy",
      variant: "danger",
    });
    if (!confirmed) return;

    const original = this.chatConversations;
    this.chatConversations = this.chatConversations.filter(
      (c) => c.conversation_id !== conversationId,
    );

    try {
      await deleteConversation(conversationId);
      showToast("Đã xóa hội thoại", "success");

      if (conversationId === this.chatConversationId) {
        if (this.chatConversations.length > 0) {
          await this.handleSwitchConversation(this.chatConversations[0].conversation_id);
        } else {
          this.handleNewConversation();
        }
      }
    } catch (err) {
      this.chatConversations = original;
      showToast(err instanceof Error ? err.message : "Không thể xóa hội thoại", "error");
    }
  }

  // Workflow handlers
  private async loadWorkflows(silent = false) {
    if (!silent) {
      this.workflowLoading = true;
      this.workflowError = null;
    }
    const startTime = Date.now();
    try {
      // Load both workflows and status in parallel
      const [workflows, status] = await Promise.all([
        listWorkflows(),
        getWorkflowStatus(),
      ]);
      this.workflows = workflows;
      this.workflowStatus = status;
    } catch (err) {
      if (!silent) {
        this.workflowError =
          err instanceof Error ? err.message : "Không thể tải workflows";
      }
    } finally {
      if (!silent) {
        // Ensure minimum 400ms loading time for visible feedback
        const elapsed = Date.now() - startTime;
        const minDelay = 400;
        if (elapsed < minDelay) {
          await new Promise(r => setTimeout(r, minDelay - elapsed));
        }
      }
      this.workflowLoading = false;
    }
  }

  private handleWorkflowFormChange(patch: Partial<WorkflowFormState>) {
    this.workflowForm = { ...this.workflowForm, ...patch };
  }

  private async handleWorkflowSubmit() {
    if (this.workflowSaving) return;
    this.workflowSaving = true;
    try {
      await createWorkflow(this.workflowForm);
      showToast(`Đã tạo workflow "${this.workflowForm.name}"`, "success");
      this.workflowForm = { ...DEFAULT_WORKFLOW_FORM };
      // Silent background refresh - no loading indicator
      this.loadWorkflows(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể tạo workflow";
      showToast(msg, "error");
      this.workflowError = msg;
    } finally {
      this.workflowSaving = false;
    }
  }

  private async handleWorkflowToggle(workflow: Workflow) {
    const newState = !workflow.enabled;
    // Optimistic update - update UI immediately
    this.workflows = this.workflows.map((w) =>
      w.id === workflow.id ? { ...w, enabled: newState } : w
    );
    try {
      await toggleWorkflow(workflow.id, newState);
      showToast(
        newState ? `Đã kích hoạt "${workflow.name}"` : `Đã tạm dừng "${workflow.name}"`,
        "success"
      );
    } catch (err) {
      // Revert on error
      this.workflows = this.workflows.map((w) =>
        w.id === workflow.id ? { ...w, enabled: !newState } : w
      );
      const msg = err instanceof Error ? err.message : "Không thể thay đổi trạng thái";
      showToast(msg, "error");
      this.workflowError = msg;
    }
  }

  private async handleWorkflowRun(workflow: Workflow) {
    // Mark as running immediately
    this.runningWorkflowIds = new Set([...this.runningWorkflowIds, workflow.id]);
    try {
      await runWorkflow(workflow.id);
      showToast(`Đang chạy "${workflow.name}"...`, "info");
      // Update lastRunStatus after a delay (workflow takes time to complete)
      setTimeout(() => {
        this.runningWorkflowIds = new Set(
          [...this.runningWorkflowIds].filter((id) => id !== workflow.id)
        );
      }, 3000);
    } catch (err) {
      this.runningWorkflowIds = new Set(
        [...this.runningWorkflowIds].filter((id) => id !== workflow.id)
      );
      const msg = err instanceof Error ? err.message : "Không thể chạy workflow";
      showToast(msg, "error");
      this.workflowError = msg;
    }
  }

  private async handleWorkflowDelete(workflow: Workflow) {
    const confirmed = await showConfirm({
      title: "Xóa workflow?",
      message: `Bạn có chắc muốn xóa workflow "${workflow.name}"? Hành động này không thể hoàn tác.`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      variant: "danger",
    });
    if (!confirmed) return;
    // Optimistic delete - remove from UI immediately
    const originalWorkflows = this.workflows;
    this.workflows = this.workflows.filter((w) => w.id !== workflow.id);
    try {
      await deleteWorkflow(workflow.id);
      showToast(`Đã xóa "${workflow.name}"`, "success");
    } catch (err) {
      // Revert on error
      this.workflows = originalWorkflows;
      const msg = err instanceof Error ? err.message : "Không thể xóa workflow";
      showToast(msg, "error");
      this.workflowError = msg;
    }
  }

  private async loadWorkflowRuns(workflowId: string | null) {
    // Toggle off - clear runs
    if (!workflowId) {
      this.workflowRunsId = null;
      this.workflowRuns = [];
      return;
    }
    this.workflowRunsId = workflowId;
    this.workflowRunsLoading = true;
    try {
      const runs = await getWorkflowRuns(workflowId);
      this.workflowRuns = runs;
    } catch (err) {
      console.error("Failed to load workflow runs:", err);
      this.workflowRuns = [];
    } finally {
      this.workflowRunsLoading = false;
    }
  }

  // Billing handlers
  // Billing - Load data from API
  private async loadBillingData() {
    // Load pricing tiers
    this.billingPricingLoading = true;
    try {
      const pricingResponse = await getPricing();
      this.billingPricingTiers = pricingResponse.tiers;
      // Select popular tier by default
      const popularIndex = pricingResponse.tiers.findIndex((t) => t.popular);
      if (popularIndex >= 0) this.billingSelectedPackage = popularIndex;
    } catch (err) {
      console.error("Failed to load pricing:", err);
    } finally {
      this.billingPricingLoading = false;
    }

    // Load pending order
    try {
      this.billingPendingOrder = await getPendingDeposit();
    } catch {
      this.billingPendingOrder = null;
    }

    // Load deposit history
    this.loadBillingHistory();
  }

  private async loadLogs() {
    if (this.logsLoading) return;
    this.logsLoading = true;
    this.logsError = null;

    try {
      // Fetch conversations from chat API
      const { conversations } = await getConversations();

      // Transform to LogEntry format
      const entries: LogEntry[] = conversations.map((c) => ({
        id: c.conversation_id,
        date: c.created_at,
        type: "chat" as const,
        preview: c.last_message ? c.last_message.slice(0, 80).replace(/\n/g, " ") : "(Cuộc hội thoại)",
      }));

      this.logsEntries = entries;
      this.logsHasMore = false; // TODO: implement pagination
    } catch (err) {
      this.logsError = err instanceof Error ? err.message : "Không thể tải lịch sử";
    } finally {
      this.logsLoading = false;
    }
  }

  private handleLogsSearchChange(query: string) {
    this.logsSearchQuery = query;
  }

  private handleLogsItemClick(log: LogEntry) {
    // Navigate to chat with this conversation
    if (log.type === "chat") {
      this.chatConversationId = log.id;
      this.chatHistoryLoaded = false; // Force reload
      this.setTab("chat");
    }
  }

  private async loadBillingHistory() {
    this.billingHistoryLoading = true;
    this.billingHistoryPage = 1;
    try {
      const historyResponse = await getDepositHistory(1000, 0);
      this.billingDepositHistory = historyResponse.deposits;
    } catch (err) {
      console.error("Failed to load deposit history:", err);
    } finally {
      this.billingHistoryLoading = false;
    }
  }

  private handleBillingHistoryPageChange(page: number) {
    this.billingHistoryPage = page;
  }

  private async handleBillingBuyTokens() {
    this.billingBuyLoading = true;
    try {
      let order;
      if (this.billingPaymentMode === "amount") {
        const amount = Number(this.billingCustomAmount);
        if (!amount || amount <= 0) return;
        order = await createDeposit({ amount });
      } else {
        const tier = this.billingPricingTiers[this.billingSelectedPackage];
        if (!tier) return;
        order = await createDeposit({ tierId: tier.id });
      }
      this.billingPendingOrder = order;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tạo đơn nạp", "error");
    } finally {
      this.billingBuyLoading = false;
    }
  }

  private handleBillingCloseQrModal() {
    this.billingShowQrModal = false;
  }

  private async handleBillingCheckTransaction() {
    if (!this.billingPendingOrder) return;

    this.billingCheckingTransaction = true;
    try {
      const order = await getDeposit(this.billingPendingOrder.id);
      this.billingPendingOrder = order;

      if (order.status === "completed") {
        showToast("Giao dịch thành công! Token đã được cộng vào tài khoản.", "success");
        this.billingPendingOrder = null;
        // Refresh user to get updated balance
        const user = await restoreSession();
        if (user) this.currentUser = user;
        // Refresh history
        this.loadBillingHistory();
      } else if (order.status === "cancelled" || order.status === "expired") {
        showToast("Đơn nạp đã bị hủy hoặc hết hạn.", "error");
        this.billingPendingOrder = null;
        this.loadBillingHistory();
      }
    } catch (err) {
      console.error("Failed to check transaction:", err);
    } finally {
      this.billingCheckingTransaction = false;
    }
  }

  private async handleBillingCancelPending() {
    if (!this.billingPendingOrder) return;

    const confirmed = await showConfirm({
      title: "Hủy đơn nạp?",
      message: "Bạn có chắc muốn hủy đơn nạp này?",
      confirmText: "Hủy đơn",
      cancelText: "Không",
      variant: "danger",
    });

    if (confirmed) {
      try {
        await cancelDeposit(this.billingPendingOrder.id);
        this.billingPendingOrder = null;
        this.billingShowQrModal = false;
        this.loadBillingHistory();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Không thể hủy đơn", "error");
      }
    }
  }

  private handleBillingRefreshHistory() {
    this.loadBillingHistory();
  }

  private async handleViewDepositDetail(deposit: import("./deposits-api").DepositOrder) {
    // Open modal and fetch full details from API
    this.billingSelectedDeposit = deposit;
    this.billingShowDetailModal = true;
    this.billingDetailLoading = true;

    try {
      const fullDeposit = await getDeposit(deposit.id);
      this.billingSelectedDeposit = fullDeposit;
    } catch (err) {
      console.error("Failed to fetch deposit details:", err);
    } finally {
      this.billingDetailLoading = false;
    }
  }

  private handleCloseDetailModal() {
    this.billingShowDetailModal = false;
    this.billingSelectedDeposit = null;
  }

  private handleBillingCreateKey() {
    if (!this.billingNewKeyName.trim()) return;
    const newKey = {
      id: Date.now().toString(),
      name: this.billingNewKeyName.trim(),
      key: `sk-...${Math.random().toString(36).substring(2, 8)}`,
      createdAt: Date.now(),
    };
    this.billingApiKeys = [...this.billingApiKeys, newKey];
    this.billingNewKeyName = "";
    this.billingShowCreateKeyModal = false;
  }

  private handleBillingCopyKey(key: string) {
    navigator.clipboard.writeText(key);
    showToast("Đã sao chép key!", "success");
  }

  private async handleBillingDeleteKey(id: string) {
    const confirmed = await showConfirm({
      title: "Xóa API key?",
      message: "Bạn có chắc muốn xóa API key này? Hành động này không thể hoàn tác.",
      confirmText: "Xóa",
      cancelText: "Hủy",
      variant: "danger",
    });
    if (confirmed) {
      this.billingApiKeys = this.billingApiKeys.filter((k) => k.id !== id);
    }
  }

  // Channels handlers
  private async loadChannels() {
    this.channelsLoading = true;
    this.channelsError = null;
    try {
      this.channels = await getChannelsStatus();
    } catch (err) {
      this.channelsError =
        err instanceof Error ? err.message : "Không thể tải kênh";
      // Fallback to default channels
      this.channels = Object.entries(CHANNEL_DEFINITIONS).map(([id, def]) => ({
        id: id as ChannelId,
        name: def.name,
        icon: def.icon,
        connected: false,
      }));
    } finally {
      this.channelsLoading = false;
    }
  }

  private async handleChannelConnect(channelId: ChannelId) {
    this.channelsConnecting = channelId;
    this.channelsError = null;
    try {
      await connectChannel(channelId);
      await this.loadChannels();
    } catch (err) {
      this.channelsError =
        err instanceof Error ? err.message : "Không thể kết nối kênh";
    } finally {
      this.channelsConnecting = null;
    }
  }

  private async handleChannelDisconnect(channelId: ChannelId) {
    this.channelsConnecting = channelId;
    this.channelsError = null;
    try {
      await disconnectChannel(channelId);
      await this.loadChannels();
    } catch (err) {
      this.channelsError =
        err instanceof Error ? err.message : "Không thể ngắt kết nối kênh";
    } finally {
      this.channelsConnecting = null;
    }
  }

  // Settings handlers
  private async loadUserProfile() {
    this.settingsLoading = true;
    this.settingsError = null;
    try {
      this.userProfile = await getUserProfile();
      this.settingsNameValue = this.userProfile.name;
    } catch (err) {
      this.settingsError =
        err instanceof Error ? err.message : "Không thể tải hồ sơ";
    } finally {
      this.settingsLoading = false;
    }
  }

  private handleEditName() {
    this.settingsEditingName = true;
    this.settingsNameValue = this.userProfile?.name || "";
  }

  private handleCancelEditName() {
    this.settingsEditingName = false;
    this.settingsNameValue = this.userProfile?.name || "";
  }

  private async handleSaveName() {
    if (!this.settingsNameValue.trim()) return;
    this.settingsSaving = true;
    this.settingsError = null;
    this.settingsSuccess = null;
    try {
      this.userProfile = await updateUserProfile({
        name: this.settingsNameValue.trim(),
      });
      this.settingsEditingName = false;
      this.settingsSuccess = "Đã cập nhật thành công";
      setTimeout(() => (this.settingsSuccess = null), 3000);
    } catch (err) {
      this.settingsError =
        err instanceof Error ? err.message : "Không thể cập nhật hồ sơ";
    } finally {
      this.settingsSaving = false;
    }
  }

  private async handleChangePassword(
    currentPassword: string,
    newPassword: string,
  ) {
    this.settingsSaving = true;
    this.settingsError = null;
    this.settingsSuccess = null;
    try {
      await changePassword(currentPassword, newPassword);
      this.settingsShowPasswordForm = false;
      this.settingsSuccess = "Đổi mật khẩu thành công";
      setTimeout(() => (this.settingsSuccess = null), 3000);
    } catch (err) {
      this.settingsError =
        err instanceof Error ? err.message : "Không thể đổi mật khẩu";
    } finally {
      this.settingsSaving = false;
    }
  }

  // Agents handlers
  private async loadAgents() {
    this.agentsLoading = true;
    this.agentsError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<AgentsListResult>("agents.list", {});
      if (res) {
        this.agentsList = res;
        const known = res.agents.some((a) => a.id === this.agentSelectedId);
        if (!this.agentSelectedId || !known) {
          this.agentSelectedId = res.defaultId ?? res.agents[0]?.id ?? null;
        }
        // Auto-load config + identity for overview panel
        if (this.agentSelectedId) {
          this.loadAgentConfig();
          this.loadAgentIdentity(this.agentSelectedId);
        }
      }
    } catch (err) {
      this.agentsError = err instanceof Error ? err.message : "Không thể tải agents";
    } finally {
      this.agentsLoading = false;
    }
  }

  private handleSelectAgent(agentId: string) {
    if (this.agentSelectedId === agentId) return;
    this.agentSelectedId = agentId;
    this.agentActivePanel = "overview";
    // Reset agent-specific state
    this.agentFilesList = null;
    this.agentFilesError = null;
    this.agentFileActive = null;
    this.agentFileContents = {};
    this.agentFileDrafts = {};
    this.agentChannelsSnapshot = null;
    this.agentChannelsLastSuccess = null;
    this.agentCronStatus = null;
    this.agentCronJobs = [];
    this.agentSkillsReport = null;
    this.agentSkillsError = null;
    this.agentSkillsAgentId = null;
    this.agentSkillsFilter = "";
    // Auto-load config + identity
    this.loadAgentConfig();
    this.loadAgentIdentity(agentId);
  }

  private handleSelectPanel(panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron") {
    this.agentActivePanel = panel;
    const agentId = this.agentSelectedId;
    if (!agentId) return;
    if (panel === "files" && this.agentFilesList?.agentId !== agentId) {
      this.loadAgentFiles(agentId);
    }
    if (panel === "channels" && !this.agentChannelsSnapshot) {
      this.loadAgentChannels();
    }
    if (panel === "cron" && !this.agentCronStatus) {
      this.loadAgentCron();
    }
    if (panel === "skills" && this.agentSkillsAgentId !== agentId) {
      this.loadAgentSkills(agentId);
    }
    if (panel === "overview" || panel === "tools") {
      if (!this.agentConfigForm) {
        this.loadAgentConfig();
      }
    }
  }

  private async loadAgentFiles(agentId: string) {
    this.agentFilesLoading = true;
    this.agentFilesError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<AgentsFilesListResult>("agents.files.list", { agentId });
      if (res) {
        this.agentFilesList = res;
        if (this.agentFileActive && !res.files.some((f) => f.name === this.agentFileActive)) {
          this.agentFileActive = null;
        }
      }
    } catch (err) {
      this.agentFilesError = err instanceof Error ? err.message : "Không thể tải files";
    } finally {
      this.agentFilesLoading = false;
    }
  }

  private async handleSelectFile(name: string) {
    this.agentFileActive = name;
    if (!this.agentSelectedId || this.agentFileContents[name] !== undefined) return;
    // Load file content from gateway
    try {
      const client = await waitForConnection();
      const res = await client.request<{ file?: AgentFileEntry }>("agents.files.get", {
        agentId: this.agentSelectedId, name,
      });
      if (res?.file) {
        const content = res.file.content ?? "";
        this.agentFileContents = { ...this.agentFileContents, [name]: content };
        this.agentFileDrafts = { ...this.agentFileDrafts, [name]: content };
      }
    } catch (err) {
      console.error("Failed to load file content:", err);
    }
  }

  private handleFileDraftChange(name: string, content: string) {
    this.agentFileDrafts = { ...this.agentFileDrafts, [name]: content };
  }

  private handleFileReset(name: string) {
    const base = this.agentFileContents[name] ?? "";
    this.agentFileDrafts = { ...this.agentFileDrafts, [name]: base };
  }

  private async handleFileSave(name: string) {
    if (!this.agentSelectedId) return;
    this.agentFileSaving = true;
    try {
      const client = await waitForConnection();
      const content = this.agentFileDrafts[name] ?? "";
      const res = await client.request<{ file?: AgentFileEntry }>("agents.files.set", {
        agentId: this.agentSelectedId, name, content,
      });
      if (res?.file) {
        this.agentFileContents = { ...this.agentFileContents, [name]: content };
        this.agentFileDrafts = { ...this.agentFileDrafts, [name]: content };
      }
      showToast("Đã lưu file", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể lưu file", "error");
    } finally {
      this.agentFileSaving = false;
    }
  }

  private async loadAgentConfig() {
    if (!this.agentSelectedId) return;
    this.agentConfigLoading = true;
    try {
      const client = await waitForConnection();
      // config.get returns ConfigSnapshot { path, exists, raw, config, issues }
      // The actual config data is inside .config
      const res = await client.request<{ config?: Record<string, unknown> }>("config.get", {});
      this.agentConfigForm = (res?.config as Record<string, unknown>) ?? {};
      this.agentConfigDirty = false;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải config", "error");
    } finally {
      this.agentConfigLoading = false;
    }
  }

  private async saveAgentConfig() {
    if (!this.agentSelectedId) return;
    this.agentConfigSaving = true;
    try {
      const client = await waitForConnection();
      const raw = JSON.stringify(this.agentConfigForm ?? {});
      await client.request("config.set", { raw });
      showToast("Đã lưu config", "success");
      this.agentConfigDirty = false;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể lưu config", "error");
    } finally {
      this.agentConfigSaving = false;
    }
  }

  private handleAgentModelChange(_agentId: string, modelId: string | null) {
    this.agentConfigForm = { ...this.agentConfigForm, primaryModel: modelId };
    this.agentConfigDirty = true;
  }

  private handleAgentModelFallbacksChange(_agentId: string, fallbacks: string[]) {
    this.agentConfigForm = { ...this.agentConfigForm, modelFallbacks: fallbacks };
    this.agentConfigDirty = true;
  }

  private async loadAgentChannels() {
    this.agentChannelsLoading = true;
    this.agentChannelsError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<ChannelsStatusSnapshot>("channels.status", {
        probe: true,
        timeoutMs: 8000,
      });
      this.agentChannelsSnapshot = res ?? {};
      this.agentChannelsLastSuccess = Date.now();
    } catch (err) {
      this.agentChannelsError = err instanceof Error ? err.message : "Không thể tải channels";
    } finally {
      this.agentChannelsLoading = false;
    }
  }

  private async loadAgentIdentity(agentId: string) {
    this.agentIdentityLoading = true;
    this.agentIdentityError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<AgentIdentityResult>("agent.identity.get", { agentId });
      if (res) {
        this.agentIdentityById = { ...this.agentIdentityById, [agentId]: res };
      }
    } catch (err) {
      this.agentIdentityError = err instanceof Error ? err.message : "Không thể tải identity";
    } finally {
      this.agentIdentityLoading = false;
    }
  }

  private async loadAgentSkills(agentId: string) {
    if (this.agentSkillsLoading) return;
    this.agentSkillsLoading = true;
    this.agentSkillsError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<SkillStatusReport>("skills.status", { agentId });
      if (res) {
        this.agentSkillsReport = res;
        this.agentSkillsAgentId = agentId;
      }
    } catch (err) {
      this.agentSkillsError = err instanceof Error ? err.message : "Không thể tải skills";
    } finally {
      this.agentSkillsLoading = false;
    }
  }

  private handleToolsProfileChange(agentId: string, profile: string | null, clearAllow: boolean) {
    if (!this.agentConfigForm) return;
    const config = { ...this.agentConfigForm };
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? [...agents.list] : [];
    const index = list.findIndex(
      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
    );
    if (index < 0) return;
    const entry = { ...(list[index] as Record<string, unknown>) };
    const tools = { ...((entry.tools as Record<string, unknown>) ?? {}) };
    if (profile) {
      tools.profile = profile;
    } else {
      delete tools.profile;
    }
    if (clearAllow) {
      delete tools.allow;
    }
    entry.tools = tools;
    list[index] = entry;
    config.agents = { ...agents, list };
    this.agentConfigForm = config;
    this.agentConfigDirty = true;
  }

  private handleToolsOverridesChange(agentId: string, alsoAllow: string[], deny: string[]) {
    if (!this.agentConfigForm) return;
    const config = { ...this.agentConfigForm };
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? [...agents.list] : [];
    const index = list.findIndex(
      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
    );
    if (index < 0) return;
    const entry = { ...(list[index] as Record<string, unknown>) };
    const tools = { ...((entry.tools as Record<string, unknown>) ?? {}) };
    if (alsoAllow.length > 0) {
      tools.alsoAllow = alsoAllow;
    } else {
      delete tools.alsoAllow;
    }
    if (deny.length > 0) {
      tools.deny = deny;
    } else {
      delete tools.deny;
    }
    entry.tools = tools;
    list[index] = entry;
    config.agents = { ...agents, list };
    this.agentConfigForm = config;
    this.agentConfigDirty = true;
  }

  private handleAgentSkillToggle(agentId: string, skillName: string, enabled: boolean) {
    if (!this.agentConfigForm) return;
    const config = { ...this.agentConfigForm };
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? [...agents.list] : [];
    const index = list.findIndex(
      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
    );
    if (index < 0) return;
    const entry = { ...(list[index] as Record<string, unknown>) };
    const normalizedSkill = skillName.trim();
    if (!normalizedSkill) return;
    const allSkills = this.agentSkillsReport?.skills?.map((s) => s.name).filter(Boolean) ?? [];
    const existing = Array.isArray(entry.skills)
      ? (entry.skills as string[]).map((n) => String(n).trim()).filter(Boolean)
      : undefined;
    const base = existing ?? allSkills;
    const next = new Set(base);
    if (enabled) {
      next.add(normalizedSkill);
    } else {
      next.delete(normalizedSkill);
    }
    entry.skills = [...next];
    list[index] = entry;
    config.agents = { ...agents, list };
    this.agentConfigForm = config;
    this.agentConfigDirty = true;
  }

  private handleAgentSkillsClear(agentId: string) {
    if (!this.agentConfigForm) return;
    const config = { ...this.agentConfigForm };
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? [...agents.list] : [];
    const index = list.findIndex(
      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
    );
    if (index < 0) return;
    const entry = { ...(list[index] as Record<string, unknown>) };
    delete entry.skills;
    list[index] = entry;
    config.agents = { ...agents, list };
    this.agentConfigForm = config;
    this.agentConfigDirty = true;
  }

  private handleAgentSkillsDisableAll(agentId: string) {
    if (!this.agentConfigForm) return;
    const config = { ...this.agentConfigForm };
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? [...agents.list] : [];
    const index = list.findIndex(
      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
    );
    if (index < 0) return;
    const entry = { ...(list[index] as Record<string, unknown>) };
    entry.skills = [];
    list[index] = entry;
    config.agents = { ...agents, list };
    this.agentConfigForm = config;
    this.agentConfigDirty = true;
  }

  private async loadAgentCron() {
    this.agentCronLoading = true;
    this.agentCronError = null;
    try {
      const client = await waitForConnection();
      // Two separate calls matching original UI: cron.status + cron.list
      const [statusRes, listRes] = await Promise.all([
        client.request<CronStatus>("cron.status", {}),
        client.request<{ jobs?: CronJob[] }>("cron.list", { includeDisabled: true }),
      ]);
      this.agentCronStatus = statusRes ?? { enabled: false, jobs: 0 };
      this.agentCronJobs = Array.isArray(listRes?.jobs) ? listRes.jobs : [];
    } catch (err) {
      this.agentCronError = err instanceof Error ? err.message : "Không thể tải cron jobs";
    } finally {
      this.agentCronLoading = false;
    }
  }

  // Skills handlers
  private async loadSkills() {
    this.skillsLoading = true;
    this.skillsError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<SkillStatusReport>("skills.status", {});
      if (res) this.skillsReport = res;
    } catch (err) {
      this.skillsError = err instanceof Error ? err.message : "Không thể tải skills";
    } finally {
      this.skillsLoading = false;
    }
  }

  private async handleSkillToggle(skillKey: string, currentDisabled: boolean) {
    this.skillsBusyKey = skillKey;
    try {
      const client = await waitForConnection();
      const enabled = currentDisabled; // if currently disabled, enable it
      await client.request("skills.update", { skillKey, enabled });
      showToast(enabled ? "Đã bật skill" : "Đã tắt skill", "success");
      await this.loadSkills();
    } catch (err) {
      this.skillsMessages = {
        ...this.skillsMessages,
        [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi" },
      };
    } finally {
      this.skillsBusyKey = null;
    }
  }

  private handleSkillEdit(skillKey: string, value: string) {
    this.skillsEdits = { ...this.skillsEdits, [skillKey]: value };
  }

  private async handleSkillSaveKey(skillKey: string) {
    this.skillsBusyKey = skillKey;
    try {
      const client = await waitForConnection();
      const apiKey = this.skillsEdits[skillKey] ?? "";
      await client.request("skills.update", { skillKey, apiKey });
      showToast("Đã lưu API key", "success");
      this.skillsMessages = {
        ...this.skillsMessages,
        [skillKey]: { kind: "success", message: "Đã lưu" },
      };
      await this.loadSkills();
    } catch (err) {
      this.skillsMessages = {
        ...this.skillsMessages,
        [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi" },
      };
    } finally {
      this.skillsBusyKey = null;
    }
  }

  private async handleSkillInstall(skillKey: string, name: string, installId: string) {
    this.skillsBusyKey = skillKey;
    try {
      const client = await waitForConnection();
      showToast(`Đang cài đặt ${name}...`, "info");
      const res = await client.request<{ message?: string }>("skills.install", {
        name, installId, timeoutMs: 120000,
      });
      await this.loadSkills();
      this.skillsMessages = {
        ...this.skillsMessages,
        [skillKey]: { kind: "success", message: res?.message ?? "Đã cài đặt" },
      };
    } catch (err) {
      this.skillsMessages = {
        ...this.skillsMessages,
        [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi cài đặt" },
      };
    } finally {
      this.skillsBusyKey = null;
    }
  }

  // Nodes handlers
  private async loadNodes() {
    this.nodesLoading = true;
    try {
      const client = await waitForConnection();
      const res = await client.request<{ nodes?: NodeInfo[] }>("node.list", {});
      this.nodesList = Array.isArray(res?.nodes) ? res.nodes : [];
    } catch (err) {
      console.error("Failed to load nodes:", err);
    } finally {
      this.nodesLoading = false;
    }
  }

  private async loadDevices() {
    this.devicesLoading = true;
    this.devicesError = null;
    try {
      const client = await waitForConnection();
      const res = await client.request<{ pending?: PendingDevice[]; paired?: PairedDevice[] }>("device.pair.list", {});
      this.devicesList = {
        pending: Array.isArray(res?.pending) ? res.pending : [],
        paired: Array.isArray(res?.paired) ? res.paired : [],
      };
    } catch (err) {
      this.devicesError = err instanceof Error ? err.message : "Không thể tải thiết bị";
    } finally {
      this.devicesLoading = false;
    }
  }

  private async handleDeviceApprove(requestId: string) {
    try {
      const client = await waitForConnection();
      await client.request("device.pair.approve", { requestId });
      showToast("Đã chấp nhận thiết bị", "success");
      await this.loadDevices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi", "error");
    }
  }

  private async handleDeviceReject(requestId: string) {
    try {
      const client = await waitForConnection();
      await client.request("device.pair.reject", { requestId });
      showToast("Đã từ chối thiết bị", "success");
      await this.loadDevices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi", "error");
    }
  }

  private async handleDeviceRotate(deviceId: string, role: string, scopes?: string[]) {
    try {
      const client = await waitForConnection();
      await client.request("device.token.rotate", { deviceId, role, scopes });
      showToast("Đã rotate token", "success");
      await this.loadDevices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi", "error");
    }
  }

  private async handleDeviceRevoke(deviceId: string, role: string) {
    try {
      const client = await waitForConnection();
      await client.request("device.token.revoke", { deviceId, role });
      showToast("Đã revoke token", "success");
      await this.loadDevices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi", "error");
    }
  }

  private async loadConfig() {
    this.configLoading = true;
    try {
      const client = await waitForConnection();
      const res = await client.request<{ config: Record<string, unknown>; hash: string }>("config.get", {});
      if (res?.config) {
        this.configSnapshot = { config: res.config, hash: res.hash ?? "" };
        this.configForm = JSON.parse(JSON.stringify(res.config));
        this.configDirty = false;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi load config", "error");
    } finally {
      this.configLoading = false;
    }
  }

  private async handleBindDefault(nodeId: string | null) {
    if (!this.configForm) return;
    const form = JSON.parse(JSON.stringify(this.configForm));
    if (!form.tools) form.tools = {};
    if (!form.tools.exec) form.tools.exec = {};
    if (nodeId) {
      form.tools.exec.node = nodeId;
    } else {
      delete form.tools.exec.node;
    }
    this.configForm = form;
    this.configDirty = true;
  }

  private async handleBindAgent(agentIndex: number, nodeId: string | null) {
    if (!this.configForm) return;
    const form = JSON.parse(JSON.stringify(this.configForm));
    if (!form.agents?.list?.[agentIndex]) return;
    const agent = form.agents.list[agentIndex];
    if (!agent.tools) agent.tools = {};
    if (!agent.tools.exec) agent.tools.exec = {};
    if (nodeId) {
      agent.tools.exec.node = nodeId;
    } else {
      delete agent.tools.exec.node;
    }
    this.configForm = form;
    this.configDirty = true;
  }

  private async handleSaveBindings() {
    if (!this.configForm || !this.configSnapshot) return;
    this.configSaving = true;
    try {
      const client = await waitForConnection();
      await client.request("config.set", {
        config: this.configForm,
        baseHash: this.configSnapshot.hash,
      });
      showToast("Đã lưu bindings", "success");
      this.configDirty = false;
      await this.loadConfig();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi lưu bindings", "error");
    } finally {
      this.configSaving = false;
    }
  }

  private async loadExecApprovals() {
    this.execApprovalsLoading = true;
    try {
      const client = await waitForConnection();
      const target = this.execApprovalsTarget;
      const nodeId = this.execApprovalsTargetNodeId;
      const params: Record<string, unknown> = {};
      if (target === "node" && nodeId) {
        params.nodeId = nodeId;
      }
      const method = target === "node" ? "exec.approvals.node.get" : "exec.approvals.get";
      const res = await client.request<import("./agent-types").ExecApprovalsSnapshot>(method, params);
      this.execApprovalsSnapshot = res;
      if (!this.execApprovalsDirty) {
        this.execApprovalsForm = res?.file ? JSON.parse(JSON.stringify(res.file)) : null;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi load exec approvals", "error");
    } finally {
      this.execApprovalsLoading = false;
    }
  }

  private async handleExecApprovalsTargetChange(kind: "gateway" | "node", nodeId: string | null) {
    this.execApprovalsTarget = kind;
    this.execApprovalsTargetNodeId = nodeId;
    this.execApprovalsSnapshot = null;
    this.execApprovalsForm = null;
    this.execApprovalsDirty = false;
  }

  private async handleExecApprovalsSelectAgent(agentId: string) {
    this.execApprovalsSelectedAgent = agentId;
  }

  private async handleExecApprovalsPatch(path: Array<string | number>, value: unknown) {
    const form = this.execApprovalsForm ?? this.execApprovalsSnapshot?.file ?? {};
    const updated = JSON.parse(JSON.stringify(form));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = typeof path[i + 1] === "number" ? [] : {};
      }
      current = current[key];
    }
    const lastKey = path[path.length - 1];
    current[lastKey] = value;
    this.execApprovalsForm = updated;
    this.execApprovalsDirty = true;
  }

  private async handleExecApprovalsRemove(path: Array<string | number>) {
    const form = this.execApprovalsForm ?? this.execApprovalsSnapshot?.file ?? {};
    const updated = JSON.parse(JSON.stringify(form));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) return;
      current = current[key];
    }
    const lastKey = path[path.length - 1];
    if (Array.isArray(current)) {
      current.splice(Number(lastKey), 1);
    } else {
      delete current[lastKey];
    }
    this.execApprovalsForm = updated;
    this.execApprovalsDirty = true;
  }

  private async handleSaveExecApprovals() {
    if (!this.execApprovalsForm || !this.execApprovalsSnapshot) return;
    this.execApprovalsSaving = true;
    try {
      const client = await waitForConnection();
      const target = this.execApprovalsTarget;
      const nodeId = this.execApprovalsTargetNodeId;
      const params: Record<string, unknown> = {
        file: this.execApprovalsForm,
        baseHash: this.execApprovalsSnapshot.hash,
      };
      if (target === "node" && nodeId) {
        params.nodeId = nodeId;
      }
      const method = target === "node" ? "exec.approvals.node.set" : "exec.approvals.set";
      await client.request(method, params);
      showToast("Đã lưu exec approvals", "success");
      this.execApprovalsDirty = false;
      await this.loadExecApprovals();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi lưu exec approvals", "error");
    } finally {
      this.execApprovalsSaving = false;
    }
  }

  // Analytics handlers
  private async loadAnalytics() {
    this.analyticsLoading = true;
    this.analyticsError = null;
    try {
      let result;
      if (this.analyticsPeriod === "custom") {
        if (!this.analyticsRangeStart || !this.analyticsRangeEnd) return;
        result = await getRangeUsage(this.analyticsRangeStart, this.analyticsRangeEnd);
      } else {
        const days = this.analyticsPeriod === "1d" ? 1 : this.analyticsPeriod === "7d" ? 7 : this.analyticsPeriod === "30d" ? 30 : 90;
        result = await getDailyUsage(days);
      }

      this.analyticsStats = transformStats(result.stats);
      this.analyticsDailyUsage = transformDailyUsage(result.daily);
      this.analyticsTypeUsage = transformTypeUsage(result.byType);
    } catch (err) {
      this.analyticsError = err instanceof Error ? err.message : "Không thể tải dữ liệu analytics";
    } finally {
      this.analyticsLoading = false;
    }
  }

  private handleAnalyticsPeriodChange(period: "1d" | "7d" | "30d" | "90d" | "custom") {
    this.analyticsPeriod = period;
    if (period !== "custom") this.loadAnalytics();
  }

  private handleAnalyticsRangeChange(start: string, end: string) {
    this.analyticsRangeStart = start;
    this.analyticsRangeEnd = end;
    if (start && end) this.loadAnalytics();
  }

  private handleThemeClick(mode: ThemeMode, event: MouseEvent) {
    this.setTheme(mode, {
      pointerClientX: event.clientX,
      pointerClientY: event.clientY,
    });
  }

  private renderThemeToggle() {
    return html`
      <div class="theme-switcher">
        <button
          class="theme-switcher-btn ${this.theme === "system" ? "active" : ""}"
          @click=${(e: MouseEvent) => this.handleThemeClick("system", e)}
          title="Tự động"
        >
          <span class="theme-switcher-icon">${icons.monitor}</span>
          <span class="theme-switcher-label">${t("themeAuto")}</span>
        </button>
        <button
          class="theme-switcher-btn ${this.theme === "light" ? "active" : ""}"
          @click=${(e: MouseEvent) => this.handleThemeClick("light", e)}
          title="Sáng"
        >
          <span class="theme-switcher-icon">${icons.sun}</span>
          <span class="theme-switcher-label">${t("themeLight")}</span>
        </button>
        <button
          class="theme-switcher-btn ${this.theme === "dark" ? "active" : ""}"
          @click=${(e: MouseEvent) => this.handleThemeClick("dark", e)}
          title="Tối"
        >
          <span class="theme-switcher-icon">${icons.moon}</span>
          <span class="theme-switcher-label">${t("themeDark")}</span>
        </button>
      </div>
    `;
  }

  private renderTokenIndicator() {
    if (this.chatSessionTokens <= 0) return nothing;
    const formatted = this.chatSessionTokens >= 1000
      ? `${(this.chatSessionTokens / 1000).toFixed(1)}k`
      : String(this.chatSessionTokens);
    return html`
      <div class="topbar-token-chip">
        <span class="topbar-token-icon">${icons.zap}</span>
        <span class="topbar-token-count">${formatted}</span>
        <span class="topbar-token-label">tokens</span>
        <div class="topbar-token-tooltip">
          <div class="topbar-token-tooltip-row">
            <span>Phiên hiện tại</span>
            <strong>${this.chatSessionTokens.toLocaleString()}</strong>
          </div>
          <div class="topbar-token-tooltip-hint">Tổng tokens đã dùng trong cuộc trò chuyện này</div>
        </div>
      </div>
    `;
  }

  private getNavLabel(tab: Tab): string {
    const labels: Record<Tab, string> = {
      chat: "Trò chuyện",
      analytics: "Phân tích",
      workflow: "Workflows",
      billing: "Thanh toán",
      logs: "Nhật ký",
      docs: "Tài liệu",
      channels: "Kênh",
      settings: "Cài đặt",
      login: "Đăng nhập",
      agents: "Agents",
      skills: "Skills",
      nodes: "Nodes",
    };
    return labels[tab] ?? tab;
  }

  private renderNavItem(item: (typeof NAV_ITEMS)[number]) {
    const isActive = this.tab === item.tab;

    // Don't show login in nav if already logged in
    if (item.tab === "login" && this.settings.isLoggedIn) {
      return nothing;
    }
    // Hide protected tabs when not logged in
    if (this.protectedTabs.includes(item.tab) && !this.settings.isLoggedIn) {
      return nothing;
    }

    return html`
      <button
        class="nav-item ${isActive ? "active" : ""}"
        @click=${() => this.setTab(item.tab)}
        title=${subtitleForTab(item.tab)}
      >
        <span class="nav-item__icon">${icons[item.icon]}</span>
        <span class="nav-item__text">${this.getNavLabel(item.tab)}</span>
      </button>
    `;
  }

  private renderNavigation() {
    const mainItems = NAV_ITEMS.filter((item) => item.section === "main");
    const agentItems = NAV_ITEMS.filter((item) => item.section === "agent");

    return html`
      <aside class="nav ${this.settings.navCollapsed ? "nav--collapsed" : ""}">
        <div class="nav-section">
          <div class="nav-section-title">${t("navMenu")}</div>
          <div class="nav-items">
            ${mainItems.map((item) => this.renderNavItem(item))}
          </div>
        </div>

        ${agentItems.length > 0 && this.settings.isLoggedIn ? html`
          <div class="nav-section">
            <div class="nav-section-title">Agent</div>
            <div class="nav-items">
              ${agentItems.map((item) => this.renderNavItem(item))}
            </div>
          </div>
        ` : nothing}

        <div class="nav-footer">
          <div class="nav-section">
            <div class="nav-items">
              ${this.settings.isLoggedIn
                ? html`
                    <button
                      class="nav-item ${this.tab === "settings"
                        ? "active"
                        : ""}"
                      @click=${() => this.setTab("settings")}
                      title="${subtitleForTab("settings")}"
                    >
                      <span class="nav-item__icon">${icons.settings}</span>
                      <span class="nav-item__text"
                        >${this.getNavLabel("settings")}</span
                      >
                    </button>
                    <button
                      class="nav-item"
                      @click=${() => this.handleLogout()}
                      title="${t("navLogout")}"
                    >
                      <span class="nav-item__icon">${icons.logOut}</span>
                      <span class="nav-item__text">${t("navLogout")}</span>
                    </button>
                  `
                : html`
                    <button
                      class="nav-item ${this.tab === "login" ? "active" : ""}"
                      @click=${() => this.setTab("login")}
                      title="${subtitleForTab("login")}"
                    >
                      <span class="nav-item__icon">${icons.logIn}</span>
                      <span class="nav-item__text">${t("navLogin")}</span>
                    </button>
                  `}
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  private renderContent() {
    switch (this.tab) {
      case "chat":
        return renderChat({
          messages: this.chatMessages,
          draft: this.chatDraft,
          sending: this.chatSending,
          loading: this.chatInitializing,
          isLoggedIn: this.settings.isLoggedIn,
          username: this.settings.username ?? undefined,
          botName: "Operis",
          streamingText: this.chatStreamingText,
          onDraftChange: (value) => (this.chatDraft = value),
          onSend: () => this.handleSendMessage(),
          onStop: () => this.handleStopChat(),
          onLoginClick: () => this.setTab("login"),
          // Sidebar props
          conversations: this.chatConversations,
          conversationsLoading: this.chatConversationsLoading,
          currentConversationId: this.chatConversationId,
          sidebarCollapsed: this.settings.chatSidebarCollapsed,
          onToggleSidebar: () => this.toggleChatSidebar(),
          onNewConversation: () => this.handleNewConversation(),
          onSwitchConversation: (id: string) => this.handleSwitchConversation(id),
          onDeleteConversation: (id: string) => this.handleDeleteConversation(id),
        });
      case "analytics":
        return renderAnalytics({
          loading: this.analyticsLoading,
          error: this.analyticsError,
          tokenBalance: this.currentUser?.token_balance ?? 0,
          stats: this.analyticsStats,
          dailyUsage: this.analyticsDailyUsage,
          typeUsage: this.analyticsTypeUsage,
          selectedPeriod: this.analyticsPeriod,
          onPeriodChange: (period) => this.handleAnalyticsPeriodChange(period),
          rangeStart: this.analyticsRangeStart,
          rangeEnd: this.analyticsRangeEnd,
          onRangeChange: (start: string, end: string) => this.handleAnalyticsRangeChange(start, end),
          onRefresh: () => this.loadAnalytics(),
        });
      case "billing":
        return renderBilling({
          creditBalance: this.currentUser?.token_balance ?? 0,
          // Payment mode
          paymentMode: this.billingPaymentMode,
          onPaymentModeChange: (mode) => { this.billingPaymentMode = mode; this.requestUpdate(); },
          // Pricing tiers from API
          pricingTiers: this.billingPricingTiers,
          pricingLoading: this.billingPricingLoading,
          selectedPackage: this.billingSelectedPackage,
          onSelectPackage: (i: number) => { this.billingSelectedPackage = i; this.requestUpdate(); },
          // Custom amount
          customAmount: this.billingCustomAmount,
          onCustomAmountChange: (v) => { this.billingCustomAmount = v; this.requestUpdate(); },
          // Buy tokens
          onBuyTokens: () => this.handleBillingBuyTokens(),
          buyLoading: this.billingBuyLoading,
          // Pending order
          pendingOrder: this.billingPendingOrder,
          onCancelPending: () => this.handleBillingCancelPending(),
          // QR Modal
          showQrModal: this.billingShowQrModal,
          onCloseQrModal: () => this.handleBillingCloseQrModal(),
          onCheckTransaction: () => this.handleBillingCheckTransaction(),
          checkingTransaction: this.billingCheckingTransaction,
          // Auto top-up
          autoTopUp: this.billingAutoTopUp,
          onToggleAutoTopUp: () =>
            (this.billingAutoTopUp = !this.billingAutoTopUp),
          // History
          depositHistory: this.billingDepositHistory.slice(
            (this.billingHistoryPage - 1) * this.billingHistoryPageSize,
            this.billingHistoryPage * this.billingHistoryPageSize,
          ),
          historyLoading: this.billingHistoryLoading,
          historyPage: this.billingHistoryPage,
          historyTotalPages: Math.ceil(this.billingDepositHistory.length / this.billingHistoryPageSize),
          onRefreshHistory: () => this.handleBillingRefreshHistory(),
          onViewDepositDetail: (deposit) => this.handleViewDepositDetail(deposit),
          onHistoryPageChange: (page) => this.handleBillingHistoryPageChange(page),
          // Detail modal
          showDetailModal: this.billingShowDetailModal,
          selectedDeposit: this.billingSelectedDeposit,
          detailLoading: this.billingDetailLoading,
          onCloseDetailModal: () => this.handleCloseDetailModal(),
          // API Keys
          apiKeys: this.billingApiKeys,
          showCreateKeyModal: this.billingShowCreateKeyModal,
          newKeyName: this.billingNewKeyName,
          onOpenCreateKeyModal: () => (this.billingShowCreateKeyModal = true),
          onCloseCreateKeyModal: () => {
            this.billingShowCreateKeyModal = false;
            this.billingNewKeyName = "";
          },
          onNewKeyNameChange: (n) => (this.billingNewKeyName = n),
          onCreateKey: () => this.handleBillingCreateKey(),
          onCopyKey: (k) => this.handleBillingCopyKey(k),
          onDeleteKey: (id) => this.handleBillingDeleteKey(id),
        });
      case "logs":
        return renderLogs({
          logs: this.logsEntries,
          loading: this.logsLoading,
          error: this.logsError,
          searchQuery: this.logsSearchQuery,
          onSearchChange: (q) => this.handleLogsSearchChange(q),
          onLoadMore: () => this.loadLogs(),
          onItemClick: (log) => this.handleLogsItemClick(log),
          hasMore: this.logsHasMore,
        });
      case "workflow":
        return renderWorkflow({
          workflows: this.workflows,
          loading: this.workflowLoading,
          error: this.workflowError,
          form: this.workflowForm,
          saving: this.workflowSaving,
          status: this.workflowStatus,
          onRefresh: () => this.loadWorkflows(),
          onFormChange: (patch) => this.handleWorkflowFormChange(patch),
          onSubmit: () => this.handleWorkflowSubmit(),
          onToggle: (w) => this.handleWorkflowToggle(w),
          onRun: (w) => this.handleWorkflowRun(w),
          onDelete: (w) => this.handleWorkflowDelete(w),
          onToggleDetails: (id: string) => {
            this.workflowExpandedId = this.workflowExpandedId === id ? null : id;
          },
          expandedWorkflowId: this.workflowExpandedId,
          runningWorkflowIds: this.runningWorkflowIds,
          // Run history
          runsWorkflowId: this.workflowRunsId,
          runs: this.workflowRuns,
          runsLoading: this.workflowRunsLoading,
          onLoadRuns: (id: string | null) => this.loadWorkflowRuns(id),
        });
      case "docs":
        return renderDocs({
          selectedSlug: this.docsSelectedSlug,
          onSelectDoc: (slug: string) => { this.docsSelectedSlug = slug; },
          onBack: () => { this.docsSelectedSlug = null; },
        });
      case "channels":
        return renderChannels({
          channels: this.channels,
          loading: this.channelsLoading,
          error: this.channelsError ?? undefined,
          connectingChannel: this.channelsConnecting ?? undefined,
          onConnect: (channel) => this.handleChannelConnect(channel),
          onDisconnect: (channel) => this.handleChannelDisconnect(channel),
          onRefresh: () => this.loadChannels(),
        });
      case "settings":
        return renderSettings({
          user: this.userProfile,
          loading: this.settingsLoading,
          saving: this.settingsSaving,
          error: this.settingsError ?? undefined,
          successMessage: this.settingsSuccess ?? undefined,
          // Profile
          editingName: this.settingsEditingName,
          nameValue: this.settingsNameValue,
          onEditName: () => this.handleEditName(),
          onCancelEditName: () => this.handleCancelEditName(),
          onNameChange: (value) => (this.settingsNameValue = value),
          onSaveName: () => this.handleSaveName(),
          // Channels
          channels: this.channels,
          channelsLoading: this.channelsLoading,
          connectingChannel: this.channelsConnecting ?? undefined,
          onConnectChannel: (channel) => this.handleChannelConnect(channel),
          onDisconnectChannel: (channel) =>
            this.handleChannelDisconnect(channel),
          onRefreshChannels: () => this.loadChannels(),
          // Security
          showPasswordForm: this.settingsShowPasswordForm,
          onTogglePasswordForm: () =>
            (this.settingsShowPasswordForm = !this.settingsShowPasswordForm),
          onChangePassword: (current, newPwd) =>
            this.handleChangePassword(current, newPwd),
          // Navigation
          onNavigate: (tab) => this.setTab(tab as Tab),
        });
      case "login":
        return renderLogin({
          loading: this.loginLoading,
          error: this.loginError ?? undefined,
          onLogin: (email, password) => this.handleLogin(email, password),
        });
      case "agents":
        return renderAgents({
          loading: this.agentsLoading,
          error: this.agentsError,
          agentsList: this.agentsList,
          selectedAgentId: this.agentSelectedId,
          activePanel: this.agentActivePanel,
          // Config state
          configForm: this.agentConfigForm,
          configLoading: this.agentConfigLoading,
          configSaving: this.agentConfigSaving,
          configDirty: this.agentConfigDirty,
          // Files state
          agentFilesLoading: this.agentFilesLoading,
          agentFilesError: this.agentFilesError,
          agentFilesList: this.agentFilesList,
          agentFileActive: this.agentFileActive,
          agentFileContents: this.agentFileContents,
          agentFileDrafts: this.agentFileDrafts,
          agentFileSaving: this.agentFileSaving,
          // Identity state
          agentIdentityById: this.agentIdentityById,
          agentIdentityLoading: this.agentIdentityLoading,
          agentIdentityError: this.agentIdentityError,
          // Channels state
          channelsLoading: this.agentChannelsLoading,
          channelsError: this.agentChannelsError,
          channelsSnapshot: this.agentChannelsSnapshot,
          channelsLastSuccess: this.agentChannelsLastSuccess,
          // Cron state
          cronLoading: this.agentCronLoading,
          cronStatus: this.agentCronStatus,
          cronJobs: this.agentCronJobs,
          cronError: this.agentCronError,
          // Agent skills state
          agentSkillsLoading: this.agentSkillsLoading,
          agentSkillsReport: this.agentSkillsReport,
          agentSkillsError: this.agentSkillsError,
          agentSkillsAgentId: this.agentSkillsAgentId,
          skillsFilter: this.agentSkillsFilter,
          // Callbacks
          onRefresh: () => this.loadAgents(),
          onSelectAgent: (id: string) => this.handleSelectAgent(id),
          onSelectPanel: (panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron") => this.handleSelectPanel(panel),
          onLoadFiles: (id: string) => this.loadAgentFiles(id),
          onSelectFile: (name: string) => this.handleSelectFile(name),
          onFileDraftChange: (name: string, content: string) => this.handleFileDraftChange(name, content),
          onFileReset: (name: string) => this.handleFileReset(name),
          onFileSave: (name: string) => this.handleFileSave(name),
          onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => this.handleToolsProfileChange(agentId, profile, clearAllow),
          onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => this.handleToolsOverridesChange(agentId, alsoAllow, deny),
          onConfigReload: () => this.loadAgentConfig(),
          onConfigSave: () => this.saveAgentConfig(),
          onModelChange: (agentId: string, modelId: string | null) => this.handleAgentModelChange(agentId, modelId),
          onModelFallbacksChange: (agentId: string, fallbacks: string[]) => this.handleAgentModelFallbacksChange(agentId, fallbacks),
          onChannelsRefresh: () => this.loadAgentChannels(),
          onCronRefresh: () => this.loadAgentCron(),
          onSkillsFilterChange: (next: string) => { this.agentSkillsFilter = next; },
          onSkillsRefresh: () => { if (this.agentSelectedId) this.loadAgentSkills(this.agentSelectedId); },
          onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => this.handleAgentSkillToggle(agentId, skillName, enabled),
          onAgentSkillsClear: (agentId: string) => this.handleAgentSkillsClear(agentId),
          onAgentSkillsDisableAll: (agentId: string) => this.handleAgentSkillsDisableAll(agentId),
        });
      case "skills":
        return renderSkills({
          loading: this.skillsLoading,
          report: this.skillsReport,
          error: this.skillsError,
          filter: this.skillsFilter,
          edits: this.skillsEdits,
          busyKey: this.skillsBusyKey,
          messages: this.skillsMessages,
          onFilterChange: (val: string) => (this.skillsFilter = val),
          onRefresh: () => this.loadSkills(),
          onToggle: (key: string, enabled: boolean) => this.handleSkillToggle(key, enabled),
          onEdit: (key: string, val: string) => this.handleSkillEdit(key, val),
          onSaveKey: (key: string) => this.handleSkillSaveKey(key),
          onInstall: (key: string, name: string, installId: string) => this.handleSkillInstall(key, name, installId),
        });
      case "nodes":
        return renderNodes({
          loading: this.nodesLoading,
          nodes: this.nodesList,
          devicesLoading: this.devicesLoading,
          devicesError: this.devicesError,
          devicesList: this.devicesList,
          configForm: this.configForm,
          configLoading: this.configLoading,
          configSaving: this.configSaving,
          configDirty: this.configDirty,
          configFormMode: this.configFormMode,
          execApprovalsLoading: this.execApprovalsLoading,
          execApprovalsSaving: this.execApprovalsSaving,
          execApprovalsDirty: this.execApprovalsDirty,
          execApprovalsSnapshot: this.execApprovalsSnapshot,
          execApprovalsForm: this.execApprovalsForm,
          execApprovalsSelectedAgent: this.execApprovalsSelectedAgent,
          execApprovalsTarget: this.execApprovalsTarget,
          execApprovalsTargetNodeId: this.execApprovalsTargetNodeId,
          onRefresh: () => this.loadNodes(),
          onDevicesRefresh: () => this.loadDevices(),
          onDeviceApprove: (reqId: string) => this.handleDeviceApprove(reqId),
          onDeviceReject: (reqId: string) => this.handleDeviceReject(reqId),
          onDeviceRotate: (deviceId: string, role: string, scopes?: string[]) => this.handleDeviceRotate(deviceId, role, scopes),
          onDeviceRevoke: (deviceId: string, role: string) => this.handleDeviceRevoke(deviceId, role),
          onLoadConfig: () => this.loadConfig(),
          onLoadExecApprovals: () => this.loadExecApprovals(),
          onBindDefault: (nodeId: string | null) => this.handleBindDefault(nodeId),
          onBindAgent: (agentIndex: number, nodeId: string | null) => this.handleBindAgent(agentIndex, nodeId),
          onSaveBindings: () => this.handleSaveBindings(),
          onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) => this.handleExecApprovalsTargetChange(kind, nodeId),
          onExecApprovalsSelectAgent: (agentId: string) => this.handleExecApprovalsSelectAgent(agentId),
          onExecApprovalsPatch: (path: Array<string | number>, value: unknown) => this.handleExecApprovalsPatch(path, value),
          onExecApprovalsRemove: (path: Array<string | number>) => this.handleExecApprovalsRemove(path),
          onSaveExecApprovals: () => this.handleSaveExecApprovals(),
        });
      default:
        return nothing;
    }
  }

  render() {
    return html`
      <div
        class="shell ${this.settings.navCollapsed || this.tab === "login"          ? "shell--nav-collapsed"
          : ""}"
      >
        <header class="topbar">
          <div class="topbar-left">
            ${this.tab !== "login"
              ? html`
                  <button
                    class="nav-collapse-toggle"
                    @click=${() => this.toggleNav()}
                    title="${this.settings.navCollapsed ? "Mở rộng" : "Thu gọn"}"
                  >
                    <span class="nav-collapse-toggle__icon">${icons.menu}</span>
                  </button>
                `
              : nothing}
            <div
              class="brand"
              @click=${() => this.setTab("chat")}
              style="cursor: pointer;"
            >
              <div class="brand-logo">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div class="brand-text">
                <div class="brand-title">${t("appName")}</div>
                <div class="brand-sub">${t("appTagline")}</div>
              </div>
            </div>
          </div>
          <div class="topbar-right">
            ${this.settings.isLoggedIn && this.tab === "chat" && this.chatConversationId ? this.renderTokenIndicator() : nothing}
            ${this.renderThemeToggle()}
            ${this.settings.isLoggedIn
              ? html`
                  <div class="topbar-user-wrap">
                    <div class="topbar-user">
                      <div class="topbar-avatar">
                        ${this.settings.username?.[0]?.toUpperCase() ?? "U"}
                      </div>
                      <span class="topbar-username"
                        >${this.settings.username}</span
                      >
                    </div>
                    <div class="topbar-dropdown">
                      <button
                        class="topbar-dropdown-item"
                        @click=${() => this.setTab("settings")}
                      >
                        <span class="topbar-dropdown-icon">${icons.settings}</span>
                        ${t("navSettings")}
                      </button>
                      <div class="topbar-dropdown-divider"></div>
                      <button
                        class="topbar-dropdown-item topbar-dropdown-item--danger"
                        @click=${() => this.handleLogout()}
                      >
                        <span class="topbar-dropdown-icon">${icons.logOut}</span>
                        ${t("navLogout")}
                      </button>
                    </div>
                  </div>
                `
              : nothing}
          </div>
        </header>

        ${this.tab !== "login" ? this.renderNavigation() : nothing}

        <main class="content ${this.tab === "login" ? "content--no-scroll" : ""}">
          ${this.tab !== "login"
            ? html`
                <section class="content-header">
                  <div>
                    <div class="page-title">${titleForTab(this.tab)}</div>
                    <div class="page-sub">${subtitleForTab(this.tab)}</div>
                  </div>
                </section>
              `
            : nothing}

          ${this.renderContent()}
        </main>

      </div>
    `;
  }
}
