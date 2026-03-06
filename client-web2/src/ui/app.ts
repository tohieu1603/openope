import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  SkillStatusReport,
  SkillMessageMap,
  DevicePairingList,
  NodeInfo,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
} from "./agent-types";
import type { DailyUsage, TypeUsage, UsageStats } from "./analytics-api";
import type { PricingTier, DepositOrder } from "./deposits-api";
import type { FeedbackReport } from "./report-api";
import type { UserProfile } from "./user-api";
import type { PendingImage, ChatMessage } from "./views/chat/chat-types";
import type { ReportFormState } from "./views/report";
import type { WorkflowStatus } from "./workflow-api";
import type { Workflow, WorkflowFormState, CronProgressState } from "./workflow-types";
import * as agents from "./app-agents-actions";
import * as analytics from "./app-analytics-actions";
// Domain action modules
import * as billing from "./app-billing-actions";
import * as channel from "./app-channel-actions";
import {
  handleSendMessage as chatSendMessage,
  handleStopChat as chatStopChat,
  removeQueuedMessage as chatRemoveQueuedMessage,
  cacheChatMessages as chatCacheMsgs,
  restoreCachedMessages as chatRestoreMsgs,
} from "./app-chat";
import * as config from "./app-config-actions";
import {
  handleChatStreamEvent as gwHandleChatStream,
  handleToolEvent as gwHandleTool,
  handleLifecycleEvent as gwHandleLifecycle,
  handleCompactionEvent as gwHandleCompaction,
  handleReconnect as gwHandleReconnect,
} from "./app-gateway";
import * as settings from "./app-settings-actions";
import * as workflow from "./app-workflow-actions";
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
  getChannelsStatus,
  saveTelegramBotToken,
  waitZaloQrLogin,
  disconnectChannel,
  CHANNEL_DEFINITIONS,
  type ChannelStatus,
  type ChannelId,
} from "./channels-api";
import { getConversations, deleteConversation, type Conversation } from "./chat-api";
import { showConfirm } from "./components/operis-confirm";
import { showToast } from "./components/operis-toast";
import { loadChatHistory } from "./controllers/chat";
import {
  subscribeToCronEvents,
  subscribeToChatStream,
  subscribeToToolEvents,
  subscribeToLifecycleEvents,
  subscribeToCompactionEvents,
  stopGatewayClient,
  waitForConnection,
  onGatewayReconnect,
  type CronEvent,
  type ChatStreamEvent,
  type ToolEvent,
  type LifecycleEvent,
  type CompactionEvent,
} from "./gateway-client";
import { t } from "./i18n";
import { icons } from "./icons";
import { NAV_ITEMS, pathForTab, tabFromPath, type Tab } from "./navigation";
import { loadSettings, saveSettings, type ClientSettings } from "./storage";
import {
  resolveTheme,
  applyTheme,
  getSystemTheme,
  type ThemeMode,
  type ResolvedTheme,
} from "./theme";
import { startThemeTransition, type ThemeTransitionContext } from "./theme-transition";
import { startUsageTracker, stopUsageTracker, reportCronUsage } from "./usage-tracker";
import { renderAgents } from "./views/agents";
import { renderAnalytics } from "./views/analytics";
import { renderBilling } from "./views/billing";
import { renderChannels } from "./views/channels";
import { renderChat } from "./views/chatsend/chat-view";
import { renderDocs } from "./views/docs";
import { renderLogin } from "./views/login";
// Register custom components
import "./components/operis-input";
import "./components/operis-select";
import "./components/operis-modal";
import "./components/operis-datetime-picker";
import "./components/operis-confirm";
import { renderLogs, type LogEntry } from "./views/logs";
import { renderNodes } from "./views/nodes";
import { renderReportView } from "./views/report";
import { renderSessions } from "./views/sessions";
import { renderSettings } from "./views/settings";
import { renderSkills } from "./views/skills";
import { renderWorkflow } from "./views/workflow";
import { DEFAULT_WORKFLOW_FORM } from "./workflow-types";

// Get page title
function titleForTab(tab: Tab): string {
  const titles: Record<Tab, string> = {
    chat: "Trò Chuyện",
    analytics: "Phân Tích",
    workflow: "Việc Định Kỳ",
    billing: "Thanh Toán",
    logs: "Nhật Ký",
    docs: "Tài Liệu",
    channels: "Kênh Kết Nối",
    settings: "Cài Đặt",
    login: "Đăng Nhập",
    agents: "Nhân Viên",
    skills: "Kĩ Năng",
    nodes: "Nodes",
    sessions: "Nhật Ký Phiên",
    report: "Góp Ý",
  };
  return titles[tab] ?? tab;
}

// Get page subtitle
function subtitleForTab(tab: Tab): string {
  const subtitles: Record<Tab, string> = {
    chat: "Trò chuyện trực tiếp với AI",
    analytics: "Xem thống kê sử dụng và chi phí",
    workflow: "Tự động hóa tác vụ với AI theo lịch",
    billing: "Xem sử dụng và quản lý gói",
    logs: "Xem nhật ký hệ thống",
    docs: "Hướng dẫn sử dụng",
    channels: "Kết nối ứng dụng nhắn tin",
    settings: "Cài đặt tài khoản và tùy chọn",
    login: "Truy cập tài khoản của bạn",
    agents: "Quản lý nhân viên và workspace",
    skills: "Quản lý kĩ năng và cài đặt",
    nodes: "Thiết bị và node kết nối",
    sessions: "Xem và quản lý các phiên hoạt động.",
    report: "Ý kiến của bạn giúp chúng mình phát triển tốt hơn",
  };
  return subtitles[tab] ?? "";
}

@customElement("operis-app")
export class OperisApp extends LitElement {
  @state() settings: ClientSettings = loadSettings();
  @state() tab: Tab = "chat";
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";

  // Chat state (messages use gateway format: content blocks or string)
  @state() chatMessages: Array<ChatMessage> = [];
  @state() chatDraft = "";
  @state() chatSending = false;
  @state() chatConversationId: string | null = null;
  @state() chatError: string | null = null;
  @state() chatInitializing = true;
  // Streaming state
  @state() chatStreamingText = "";
  @state() chatStreamingRunId: string | null = null;
  // Tool call tracking for current run (structured like original ToolStreamEntry)
  @state() chatToolCalls: Array<{
    id: string;
    name: string;
    phase: "start" | "update" | "result";
    isError?: boolean;
    detail?: string;
    output?: string;
  }> = [];
  @state() chatPendingImages: PendingImage[] = [];
  @state() chatAttachments: Array<{ id: string; dataUrl: string; mimeType: string }> = [];
  // Session token tracking
  @state() chatSessionTokens = 0;
  // Thinking level from gateway session (off | low | medium | high)
  @state() chatThinkingLevel: string | null = null;
  @state() chatTokenBalance = 0;
  // Available models from gateway
  @state() chatAvailableModels: Array<{
    id: string;
    name: string;
    provider: string;
    reasoning?: boolean;
  }> = [];
  @state() chatModelsLoading = false;
  @state() chatCurrentModel: string | null = null;
  // Current chat run ID for abort
  chatRunId: string | null = null;
  // Lifecycle subscription cleanup
  private lifecycleEventUnsubscribe: (() => void) | null = null;
  // Chat queue — messages sent while busy, flushed after final (like original UI)
  @state() chatQueue: Array<{
    id: string;
    text: string;
    createdAt: number;
    images?: PendingImage[];
  }> = [];
  // Compaction status (agent compressing context)
  @state() chatCompactionActive = false;
  @state() chatAtBottom = true;
  compactionClearTimer: ReturnType<typeof setTimeout> | null = null;
  private compactionEventUnsubscribe: (() => void) | null = null;
  // Chat sidebar state
  @state() chatConversations: Conversation[] = [];
  @state() chatConversationsLoading = false;
  // Gateway sessions (for session selector dropdown)
  @state() gatewaySessions: Array<{
    key: string;
    displayName?: string;
    derivedTitle?: string;
    lastMessagePreview?: string;
    model?: string;
    updatedAt?: number | null;
    kind?: string;
  }> = [];
  // Sessions tab state
  @state() sessionsLoading = false;
  @state() sessionsResult: {
    ts: number;
    path: string;
    count: number;
    defaults: { model: string | null; contextTokens: number | null };
    sessions: Array<{
      key: string;
      kind: "direct" | "group" | "global" | "unknown";
      label?: string;
      displayName?: string;
      updatedAt: number | null;
      thinkingLevel?: string;
      verboseLevel?: string;
      reasoningLevel?: string;
      modelProvider?: string;
      totalTokens?: number;
      contextTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
    }>;
  } | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsActiveMinutes = "";
  @state() sessionsLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;
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
  @state() workflowDetailWorkflow: import("./workflow-types").Workflow | null = null;
  @state() runningWorkflowIds: Set<string> = new Set();
  @state() workflowStatus: WorkflowStatus | null = null;
  // Run history state
  @state() workflowRunsId: string | null = null;
  @state() workflowRuns: Array<{
    ts: number;
    status: string;
    summary?: string;
    durationMs?: number;
    error?: string;
  }> = [];
  @state() workflowRunsLoading = false;
  // Split panel + progress state
  @state() selectedWorkflowId: string | null = null;
  @state() progressMap: Map<string, CronProgressState> = new Map();
  @state() workflowShowForm = false;
  @state() editingWorkflowId: string | null = null;
  @state() workflowModalRun: import("./workflow-api").WorkflowRun | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

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
  @state() billingFreeResetAt = 0;
  private billingCountdownTimer: ReturnType<typeof setInterval> | null = null;
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
  @state() zaloQrBase64: string | null = null;
  @state() zaloQrStatus: string | null = null;
  @state() telegramTokenModal = false;
  @state() telegramTokenValue = "";
  @state() telegramTokenSaving = false;
  @state() telegramTokenError: string | null = null;

  // Settings state
  @state() userProfile: UserProfile | null = null;
  @state() settingsLoading = false;
  @state() settingsSaving = false;
  @state() settingsError: string | null = null;
  @state() settingsSuccess: string | null = null;
  @state() settingsEditingName = false;
  @state() settingsNameValue = "";
  @state() settingsShowPasswordForm = false;
  // API key state (operis provider key from gateway config)
  @state() settingsApiKey = "";
  @state() settingsApiKeyLoading = false;
  @state() settingsApiKeySaving = false;
  @state() settingsApiKeyHasKey = false;

  // Agents state
  @state() agentsLoading = false;
  @state() agentsError: string | null = null;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentSelectedId: string | null = null;
  @state() agentActivePanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  // Agent config state
  @state() agentConfigForm: Record<string, unknown> | null = null;
  @state() agentConfigBaseHash: string | null = null;
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

  // Report state
  @state() reports: FeedbackReport[] = [];
  @state() reportLoading = false;
  @state() reportError: string | null = null;
  @state() reportForm: ReportFormState = { type: "bug", subject: "", content: "" };
  @state() reportSubmitting = false;

  // Gateway status (Electron only)
  @state() gatewayStatus: "unknown" | "stopped" | "starting" | "running" | "error" = "unknown";

  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private popStateHandler = () => this.handlePopState();
  private clickOutsideHandler = () => {
    /* no-op: token dropdown removed */
  };
  private sessionExpiredHandler: (() => void) | null = null;
  private cronEventUnsubscribe: (() => void) | null = null;
  private chatStreamUnsubscribe: (() => void) | null = null;
  private toolEventUnsubscribe: (() => void) | null = null;
  private gatewayStatusUnsubscribe: (() => void) | null = null;
  private reconnectUnsubscribe: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Clean up legacy localStorage tokens (now using HttpOnly cookies)
    localStorage.removeItem("operis_accessToken");
    localStorage.removeItem("operis_refreshToken");

    // Subscribe to gateway status (Electron only)
    if (window.electronAPI?.onGatewayStatus) {
      this.gatewayStatusUnsubscribe = window.electronAPI.onGatewayStatus((status) => {
        this.gatewayStatus = status as typeof this.gatewayStatus;
      });
    } else {
      this.gatewayStatus = "running"; // Not Electron — assume running
    }

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
    if (initialTab === "login" && this.settings.isLoggedIn) {
      initialTab = "chat";
      window.history.replaceState({}, "", pathForTab("chat"));
    }
    if (initialTab) {
      this.tab = initialTab;
    }

    // Restore chat session from URL ?session= param (like original applySettingsFromUrl)
    // Falls back to lastSessionKey from localStorage
    this.restoreSessionFromUrl();

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

    // Subscribe to tool events for showing tool calls in chat
    this.toolEventUnsubscribe = subscribeToToolEvents((evt: ToolEvent) => {
      this.handleToolEvent(evt);
    });

    // Subscribe to compaction events (agent compressing context)
    this.compactionEventUnsubscribe = subscribeToCompactionEvents((evt: CompactionEvent) => {
      this.handleCompactionEvent(evt);
    });

    // Subscribe to agent lifecycle events (start/end/error)
    this.lifecycleEventUnsubscribe = subscribeToLifecycleEvents((evt: LifecycleEvent) => {
      this.handleLifecycleEvent(evt);
    });

    // Reload current tab data when gateway WS reconnects after a drop
    // (Original: onHello silently resets orphaned chat run state, then refreshes active tab)
    this.reconnectUnsubscribe = onGatewayReconnect(() => {
      gwHandleReconnect(this);
      this.loadTabData(this.tab);
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
      // Init progress state
      const pm = new Map(this.progressMap);
      pm.set(evt.jobId, {
        jobId: evt.jobId,
        phase: "initializing",
        toolCalls: [],
        startedAtMs: evt.runAtMs ?? Date.now(),
      });
      this.progressMap = pm;
      this.startProgressTimer();
      // Auto-select running workflow if none selected
      if (!this.selectedWorkflowId) {
        this.selectedWorkflowId = evt.jobId;
      }
    } else if (evt.action === "progress") {
      const step = evt.step;
      if (!step) return;
      const pm = new Map(this.progressMap);
      const prev = pm.get(evt.jobId);
      if (prev) {
        pm.set(evt.jobId, { ...prev, phase: step });
      }
      this.progressMap = pm;
    } else if (evt.action === "activity") {
      const a = evt.activity;
      if (!a) return;
      const pm = new Map(this.progressMap);
      const prev = pm.get(evt.jobId);
      if (!prev) return;

      if (a.kind === "tool") {
        const toolCalls = [...prev.toolCalls];
        if (a.phase === "start") {
          toolCalls.push({
            id: a.id,
            name: a.name ?? "tool",
            detail: a.detail,
            startedAtMs: Date.now(),
          });
        } else if (a.phase === "result") {
          const idx = toolCalls.findIndex((t) => t.id === a.id);
          if (idx >= 0) {
            toolCalls[idx] = { ...toolCalls[idx], finishedAtMs: Date.now(), isError: a.isError };
          }
        }
        pm.set(evt.jobId, { ...prev, toolCalls });
      } else if (a.kind === "thinking") {
        pm.set(evt.jobId, { ...prev, thinkingText: a.detail });
      }
      this.progressMap = pm;
    } else if (evt.action === "finished") {
      const newSet = new Set(this.runningWorkflowIds);
      newSet.delete(evt.jobId);
      this.runningWorkflowIds = newSet;

      // Mark progress as finished
      const pm = new Map(this.progressMap);
      const prev = pm.get(evt.jobId);
      if (prev) {
        const toolCalls = prev.toolCalls.map((t) =>
          t.finishedAtMs ? t : { ...t, finishedAtMs: Date.now() },
        );
        pm.set(evt.jobId, {
          ...prev,
          phase: "delivering",
          toolCalls,
          finishedAtMs: Date.now(),
          status: evt.status ?? "ok",
        });
        this.progressMap = pm;
        // Clear progress after 8s
        setTimeout(() => {
          const pm2 = new Map(this.progressMap);
          pm2.delete(evt.jobId);
          this.progressMap = pm2;
          this.stopProgressTimerIfIdle();
        }, 8000);
      }

      // Report cron usage to Operis BE (request_type: "cron") when gateway includes it
      if (evt.usage && (evt.usage.input || evt.usage.output)) {
        reportCronUsage(evt.usage, evt.jobId, evt.model);
      }
    }

    // Auto-refresh workflows when on workflow tab (silent - no loading indicator)
    if (this.tab === "workflow") {
      if (!this.workflowLoading) {
        this.loadWorkflows(true);
      }
    }
  }

  private startProgressTimer() {
    if (this.progressTimer) return;
    this.progressTimer = setInterval(() => {
      if (this.progressMap.size > 0) {
        this.progressMap = new Map(this.progressMap);
      }
    }, 1000);
  }

  private stopProgressTimerIfIdle() {
    if (this.progressMap.size === 0 && this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  // --- Event handlers — delegated to app-gateway.ts / app-chat.ts ---

  private handleToolEvent(evt: ToolEvent) {
    gwHandleTool(this, evt);
  }

  private handleChatStreamEvent(evt: ChatStreamEvent) {
    gwHandleChatStream(this, evt);
  }

  private handleLifecycleEvent(evt: LifecycleEvent) {
    gwHandleLifecycle(this, evt);
  }

  private handleCompactionEvent(evt: CompactionEvent) {
    gwHandleCompaction(this, evt);
  }

  // --- Chat helpers — delegated to app-chat.ts ---

  cacheChatMessages() {
    chatCacheMsgs(this);
  }

  private restoreCachedMessages(): boolean {
    return chatRestoreMsgs(this);
  }

  private removeQueuedMessage(id: string) {
    chatRemoveQueuedMessage(this, id);
  }

  private static _lastRestoreMs = 0;
  private async tryRestoreSession() {
    // Debounce: skip if called again within 3s (e.g. HMR re-mounts)
    const now = Date.now();
    if (now - OperisApp._lastRestoreMs < 3000) return;
    OperisApp._lastRestoreMs = now;
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
    // Subscribe to tool events
    if (!this.toolEventUnsubscribe) {
      this.toolEventUnsubscribe = subscribeToToolEvents((evt: ToolEvent) => {
        this.handleToolEvent(evt);
      });
    }
    startUsageTracker();
  }

  private stopGatewayServices() {
    this.cronEventUnsubscribe?.();
    this.cronEventUnsubscribe = null;
    this.chatStreamUnsubscribe?.();
    this.chatStreamUnsubscribe = null;
    this.toolEventUnsubscribe?.();
    this.toolEventUnsubscribe = null;
    this.compactionEventUnsubscribe?.();
    this.compactionEventUnsubscribe = null;
    this.lifecycleEventUnsubscribe?.();
    this.lifecycleEventUnsubscribe = null;
    this.reconnectUnsubscribe?.();
    this.reconnectUnsubscribe = null;
    stopUsageTracker();
    stopGatewayClient();
  }

  private loadTabData(tab: string) {
    if (tab === "chat") {
      // Load current session messages from gateway (source of truth)
      this.loadChatMessagesFromGateway(true).then(() => this.scrollChatToBottom());
      // Load available sessions for the session selector dropdown
      this.loadGatewaySessions();
      this.loadAvailableModels();
    } else if (tab === "workflow") {
      this.loadWorkflows();
    } else if (tab === "channels") {
      this.loadChannels();
    } else if (tab === "settings") {
      this.loadUserProfile();
      this.loadChannels();
      this.loadApiKeyStatus();
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
      this.startBillingCountdown();
    } else if (tab === "logs") {
      this.loadLogs();
    } else if (tab === "sessions") {
      this.loadSessionsList();
    } else if (tab === "report") {
      this.loadReports();
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
    this.gatewayStatusUnsubscribe?.();
    this.stopGatewayServices();
    this.stopBillingCountdown();
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.compactionClearTimer) {
      clearTimeout(this.compactionClearTimer);
      this.compactionClearTimer = null;
    }
    super.disconnectedCallback();
  }

  private readonly protectedTabs = [
    "chat",
    "workflow",
    "channels",
    "settings",
    "agents",
    "skills",
    "nodes",
    "analytics",
    "billing",
    "logs",
    "sessions",
  ];

  private handlePopState() {
    let tab = tabFromPath(window.location.pathname);
    if (tab === "login" && this.settings.isLoggedIn) {
      tab = "chat";
      window.history.replaceState({}, "", pathForTab("chat"));
    }
    // Redirect to login if not logged in and on protected page
    if (tab && this.protectedTabs.includes(tab) && !this.settings.isLoggedIn) {
      tab = "login";
      window.history.replaceState({}, "", pathForTab("login"));
    }
    if (tab) {
      // Restore session from URL on chat tab navigation
      if (tab === "chat") {
        const params = new URLSearchParams(window.location.search);
        const session = params.get("session")?.trim();
        if (session && session !== (this.chatConversationId || "main")) {
          this.chatConversationId = session === "main" ? null : session;
          this.persistSessionKey(session);
        }
      }
      this.setTab(tab);
    }
  }

  private setTab(tab: Tab) {
    if (tab === "login" && this.settings.isLoggedIn) {
      tab = "chat";
    }
    // Block protected tabs when not logged in
    if (this.protectedTabs.includes(tab) && !this.settings.isLoggedIn) {
      tab = "login";
    }
    if (tab === this.tab) return;
    // Cleanup previous tab timers
    this.stopBillingCountdown();
    this.tab = tab;
    const path = pathForTab(tab);
    window.history.pushState({}, "", path);
    // Sync ?session= param in URL (add on chat tab, remove on others)
    this.syncSessionUrl();

    this.loadTabData(tab);
  }

  /** Load available sessions from gateway for session selector dropdown */
  async loadGatewaySessions() {
    try {
      const gw = await waitForConnection(5000);
      const result = await gw.request<{
        sessions: Array<{
          key: string;
          displayName?: string;
          derivedTitle?: string;
          lastMessagePreview?: string;
          model?: string;
          updatedAt?: number | null;
          kind?: string;
        }>;
      }>("sessions.list", {
        includeGlobal: false,
        includeUnknown: false,
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
      if (result?.sessions) {
        // Only show web-chat sessions: agent keys whose rest part has no ":"
        // This excludes telegram:*, openai-user:*, cron:*, discord:*, etc.
        this.gatewaySessions = result.sessions.filter((s) => {
          if (!s.key.startsWith("agent:")) return false;
          if (s.kind === "group") return false;
          const rest = this.shortSessionKey(s.key);
          return !rest.includes(":");
        });
        // Sync current model from the active session
        this.syncCurrentModelFromSessions();
      }
    } catch (err) {
      console.error("[chat] Failed to load gateway sessions:", err);
    }
  }

  /** Set chatCurrentModel from the matching session in gatewaySessions. */
  private syncCurrentModelFromSessions() {
    const currentKey = this.normalizeSessionKey(this.chatConversationId || "main");
    const match = this.gatewaySessions.find((s) => s.key === currentKey);
    if (match?.model) {
      this.chatCurrentModel = match.model;
    }
  }

  /** Normalize session key: "main" → "agent:main:main", passthrough if already full key */
  normalizeSessionKey(key: string): string {
    if (key.startsWith("agent:")) return key;
    return `agent:main:${key}`;
  }

  /** Strip agent prefix: "agent:main:main" → "main", "agent:main:telegram:123" → "telegram:123" */
  private shortSessionKey(key: string): string {
    if (!key.startsWith("agent:")) return key;
    const firstColon = key.indexOf(":");
    const secondColon = key.indexOf(":", firstColon + 1);
    if (secondColon === -1) return key;
    return key.substring(secondColon + 1);
  }

  // Guard against session switch race conditions
  private sessionSwitchSeq = 0;

  /** Switch to a different gateway session */
  private async handleSessionChange(key: string) {
    const fullKey = this.normalizeSessionKey(key);
    const currentFull = this.normalizeSessionKey(this.chatConversationId || "main");
    if (fullKey === currentFull) return;

    // Increment seq to invalidate any in-flight history loads
    const seq = ++this.sessionSwitchSeq;

    // Store full key so chat.history receives the exact key from sessions.list
    this.chatConversationId = fullKey;
    this.chatMessages = [];
    this.chatStreamingText = "";
    this.chatToolCalls = [];
    this.persistSessionKey(fullKey);

    // Update model from cached session data (instant), then load history (which also re-syncs)
    this.syncCurrentModelFromSessions();
    await this.loadChatMessagesFromGateway(true);

    // Discard result if user switched again during load
    if (this.sessionSwitchSeq !== seq) return;
    this.scrollChatToBottom();
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

  async scrollChatToBottom() {
    await this.updateComplete;

    // Try chatsend view first (.chat-thread), then old view (.gc-messages)
    const chatThread = this.renderRoot.querySelector(".chat-thread") as HTMLElement;
    if (chatThread) {
      chatThread.scrollTop = chatThread.scrollHeight;
      return;
    }

    const messagesEl = this.renderRoot.querySelector(".gc-messages") as HTMLElement;
    if (!messagesEl) {
      // Fallback: scroll main content area
      const main = this.renderRoot.querySelector("main.content") as HTMLElement;
      if (main) main.scrollTop = main.scrollHeight;
      return;
    }

    // Hide messages to prevent flash at top while positioning scroll
    messagesEl.style.visibility = "hidden";
    await new Promise((r) => requestAnimationFrame(r));

    const userMessages = messagesEl.querySelectorAll(".gc-message--user");
    const lastUserMsg = userMessages[userMessages.length - 1] as HTMLElement;

    if (!lastUserMsg) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      messagesEl.style.visibility = "";
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

    // Reveal messages after scroll is positioned
    messagesEl.style.visibility = "";

    // Auto-focus the chat input
    const input = this.renderRoot.querySelector(
      ".gc-input-bottom .gc-input",
    ) as HTMLTextAreaElement;
    input?.focus();
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
      // Gateway token redirect — disabled: local gateway auto-authorizes localhost
      // if (result.user.gateway_token) {
      //   window.location.href = `/`;
      //   return;
      // }
      // Reset chat state for fresh load
      this.chatInitializing = true;
      this.setTab("chat");
    } catch (err) {
      this.loginError = err instanceof Error ? err.message : "Đăng nhập thất bại";
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
    showToast("Đã đăng xuất", "success");
  }

  private handleImageSelect(files: FileList) {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        if (!base64) return;
        this.chatPendingImages = [
          ...this.chatPendingImages,
          {
            data: base64,
            mimeType: file.type,
            preview: dataUrl,
          },
        ];
      };
      reader.readAsDataURL(file);
    }
  }

  private handleImageRemove(index: number) {
    this.chatPendingImages = this.chatPendingImages.filter((_, i) => i !== index);
  }

  private async handleSendMessage() {
    // Merge chat attachments into chatPendingImages before sending
    if (this.chatAttachments.length > 0) {
      this.chatPendingImages = [
        ...this.chatPendingImages,
        ...this.chatAttachments.map((a) => ({
          data: a.dataUrl.replace(/^data:[^;]+;base64,/, ""),
          mimeType: a.mimeType,
          preview: a.dataUrl,
        })),
      ];
      this.chatAttachments = [];
    }
    await chatSendMessage(this);
  }

  private handleStopChat() {
    chatStopChat(this);
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
      conversations.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      this.chatConversations = conversations;
    } catch (err) {
      console.error("[chat] Failed to load conversations:", err);
    } finally {
      this.chatConversationsLoading = false;
    }
  }

  // --- Session persistence (like original app-settings.ts) ---

  /** Restore chat session from URL ?session= param or localStorage. */
  private restoreSessionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get("session")?.trim();
    if (sessionParam && this.isChatSession(sessionParam)) {
      this.chatConversationId = sessionParam;
      this.persistSessionKey(sessionParam);
    } else if (
      this.settings.lastSessionKey &&
      this.settings.lastSessionKey !== "main" &&
      this.isChatSession(this.settings.lastSessionKey)
    ) {
      this.chatConversationId = this.settings.lastSessionKey;
    }
    // Sync URL to include session param on chat tab
    this.syncSessionUrl();
  }

  /** Check if session key is a valid interactive chat session (not cron/telegram/discord/etc.) */
  private isChatSession(key: string): boolean {
    if (!key.startsWith("agent:")) return true; // short key like "main"
    const rest = this.shortSessionKey(key);
    return !rest.includes(":"); // exclude cron:*, telegram:*, discord:*, etc.
  }

  /** Save session key to localStorage and update URL. */
  private persistSessionKey(key: string) {
    const next = { ...this.settings, lastSessionKey: key };
    this.settings = next;
    saveSettings(next);
    this.syncSessionUrl();
  }

  /** Keep URL in sync: add ?session= on chat tab, remove on others. */
  private syncSessionUrl() {
    const url = new URL(window.location.href);
    const sessionKey = this.chatConversationId || "main";
    if (this.tab === "chat" && sessionKey) {
      url.searchParams.set("session", sessionKey);
    } else {
      url.searchParams.delete("session");
    }
    window.history.replaceState({}, "", url.toString());
  }

  private handleNewConversation() {
    // Simulate typing "/new" — triggers gateway session reset + greeting
    this.chatDraft = "/new";
    this.handleSendMessage();
  }

  /**
   * Load chat messages from gateway WS `chat.history` — source of truth.
   * On initial load: show cache instantly as placeholder, then gateway replaces.
   */
  async loadChatMessagesFromGateway(isInitialLoad = false) {
    if (isInitialLoad) {
      this.restoreCachedMessages();
    }
    const loadSeq = this.sessionSwitchSeq;

    try {
      const gw = await waitForConnection(5000);
      const sessionKey = this.chatConversationId || "main";
      const result = await loadChatHistory(gw, sessionKey);

      // Preserve scroll position on non-initial reloads
      const messagesEl = !isInitialLoad
        ? (this.renderRoot.querySelector(".gc-messages") as HTMLElement)
        : null;
      const prevScrollTop = messagesEl?.scrollTop ?? 0;
      const prevScrollHeight = messagesEl?.scrollHeight ?? 0;

      // Discard if user switched sessions during this load
      if (this.sessionSwitchSeq !== loadSeq) return;

      this.chatMessages = result.messages;
      if (result.thinkingLevel !== null) {
        this.chatThinkingLevel = result.thinkingLevel;
      }
      this.cacheChatMessages();

      if (messagesEl) {
        await this.updateComplete;
        requestAnimationFrame(() => {
          const delta = messagesEl.scrollHeight - prevScrollHeight;
          messagesEl.scrollTop = prevScrollTop + delta;
        });
      }
    } catch (err) {
      console.warn("[chat] Failed to load messages from gateway:", err);
      if (this.chatMessages.length === 0) {
        this.restoreCachedMessages();
      }
    } finally {
      if (isInitialLoad) {
        this.chatInitializing = false;
      }
    }
  }

  private async handleRefreshChat() {
    // Match original UI: resetToolStream + refreshChat (history + sessions + scroll)
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatToolCalls = [];

    // Load messages from gateway WS (source of truth)
    await this.loadChatMessagesFromGateway();

    // Reload session selector
    this.loadGatewaySessions();
    this.scrollChatToBottom();
  }

  private async handleSwitchConversation(conversationId: string) {
    if (conversationId === this.chatConversationId) return;

    this.chatConversationId = conversationId;
    this.persistSessionKey(conversationId);
    this.chatMessages = [];
    this.chatInitializing = true;
    this.chatSessionTokens = 0;
    this.chatError = null;

    // Update model from cached session data (instant)
    this.syncCurrentModelFromSessions();
    // Use gateway chat.history (source of truth) instead of REST API
    await this.loadChatMessagesFromGateway(true);
    this.scrollChatToBottom();
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

  // Workflow handlers — delegate to app-workflow-actions
  private async loadWorkflows(silent = false) {
    await workflow.loadWorkflows(this, silent);
  }

  private handleWorkflowFormChange(patch: Partial<WorkflowFormState>) {
    workflow.handleWorkflowFormChange(this, patch);
  }

  private handleWorkflowEdit(wf: Workflow) {
    workflow.handleWorkflowEdit(this, wf);
  }

  private async handleWorkflowSubmit() {
    await workflow.handleWorkflowSubmit(this);
  }

  private async handleWorkflowToggle(wf: Workflow) {
    await workflow.handleWorkflowToggle(this, wf);
  }

  private async handleWorkflowRun(wf: Workflow) {
    await workflow.handleWorkflowRun(this, wf);
  }

  private async handleWorkflowCancel(wf: Workflow) {
    await workflow.handleWorkflowCancel(this, wf);
  }

  private async handleWorkflowDelete(wf: Workflow) {
    await workflow.handleWorkflowDelete(this, wf);
  }

  private async loadWorkflowRuns(workflowId: string | null) {
    await workflow.loadWorkflowRuns(this, workflowId);
  }

  // Billing handlers
  private startBillingCountdown() {
    this.stopBillingCountdown();
    this.billingCountdownTimer = setInterval(() => this.requestUpdate(), 1000);
  }

  private stopBillingCountdown() {
    if (this.billingCountdownTimer) {
      clearInterval(this.billingCountdownTimer);
      this.billingCountdownTimer = null;
    }
  }

  // Billing handlers — delegate to app-billing-actions
  private async loadBillingData() {
    await billing.loadBillingData(this);
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
        preview: c.last_message
          ? c.last_message.slice(0, 80).replace(/\n/g, " ")
          : "(Cuộc hội thoại)",
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
      this.setTab("chat");
    }
  }

  private async loadBillingHistory() {
    await billing.loadBillingHistory(this);
  }

  private handleBillingHistoryPageChange(page: number) {
    billing.handleBillingHistoryPageChange(this, page);
  }

  private async handleBillingBuyTokens() {
    await billing.handleBillingBuyTokens(this);
  }

  private handleBillingCloseQrModal() {
    billing.handleBillingCloseQrModal(this);
  }

  private async handleBillingCheckTransaction() {
    await billing.handleBillingCheckTransaction(this);
  }

  private async handleBillingCancelPending() {
    await billing.handleBillingCancelPending(this);
  }

  private handleBillingRefreshHistory() {
    billing.handleBillingRefreshHistory(this);
  }

  private async handleViewDepositDetail(deposit: import("./deposits-api").DepositOrder) {
    await billing.handleViewDepositDetail(this, deposit);
  }

  private handleCloseDetailModal() {
    billing.handleCloseDetailModal(this);
  }

  private handleBillingCreateKey() {
    billing.handleBillingCreateKey(this);
  }

  private handleBillingCopyKey(key: string) {
    billing.handleBillingCopyKey(this, key);
  }

  private async handleBillingDeleteKey(id: string) {
    await billing.handleBillingDeleteKey(this, id);
  }

  // Channels handlers — delegate to app-channel-actions
  private async loadChannels() {
    await channel.loadChannels(this);
  }

  private async handleChannelConnect(channelId: ChannelId) {
    await channel.handleChannelConnect(this, channelId);
    // If Zalo QR flow started, kick off background wait
    if (channelId === "zalo" && this.zaloQrStatus !== null) {
      this.startZaloLoginWait();
    }
  }

  private async handleTelegramTokenSave() {
    const token = this.telegramTokenValue.trim();
    if (!token) return;
    this.telegramTokenSaving = true;
    this.telegramTokenError = null;
    try {
      await saveTelegramBotToken(token);
      this.telegramTokenModal = false;
      this.telegramTokenValue = "";
      showToast("Bot token đã lưu — đang kết nối Telegram...", "success");
      // Wait briefly for gateway restart then reload status
      setTimeout(() => this.loadChannels(), 3000);
    } catch (err) {
      this.telegramTokenError = err instanceof Error ? err.message : "Không thể lưu bot token";
    } finally {
      this.telegramTokenSaving = false;
    }
  }

  private handleTelegramTokenCancel() {
    this.telegramTokenModal = false;
    this.telegramTokenValue = "";
    this.telegramTokenError = null;
    this.channelsConnecting = null;
  }

  private async startZaloLoginWait() {
    await channel.startZaloLoginWait(this);
  }

  private stopZaloPolling() {
    channel.stopZaloPolling(this);
  }

  private async handleChannelDisconnect(channelId: ChannelId) {
    await channel.handleChannelDisconnect(this, channelId);
  }

  // Settings handlers — delegate to app-settings-actions
  private async loadUserProfile() {
    await settings.loadUserProfile(this);
  }

  private handleEditName() {
    settings.handleEditName(this);
  }

  private handleCancelEditName() {
    settings.handleCancelEditName(this);
  }

  private async handleSaveName() {
    await settings.handleSaveName(this);
  }

  private async handleChangePassword(currentPassword: string, newPassword: string) {
    await settings.handleChangePassword(this, currentPassword, newPassword);
  }

  // API key handlers
  private async loadApiKeyStatus() {
    await settings.loadApiKeyStatus(this);
  }

  private async handleSaveApiKey() {
    await settings.handleSaveApiKey(this);
  }

  // Agents handlers — delegate to app-agents-actions
  private async loadAgents() {
    await agents.loadAgents(this);
  }

  private handleSelectAgent(agentId: string) {
    agents.handleSelectAgent(this, agentId);
  }

  private handleSelectPanel(
    panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron",
  ) {
    agents.handleSelectPanel(this, panel);
  }

  private async loadAgentFiles(agentId: string) {
    await agents.loadAgentFiles(this, agentId);
  }

  private async handleSelectFile(name: string) {
    await agents.handleSelectFile(this, name);
  }

  private handleFileDraftChange(name: string, content: string) {
    agents.handleFileDraftChange(this, name, content);
  }

  private handleFileReset(name: string) {
    agents.handleFileReset(this, name);
  }

  private async handleFileSave(name: string) {
    await agents.handleFileSave(this, name);
  }

  private async loadAgentConfig() {
    await agents.loadAgentConfig(this);
  }

  private async saveAgentConfig() {
    await agents.saveAgentConfig(this);
  }

  private handleAgentModelChange(agentId: string, modelId: string | null) {
    agents.handleAgentModelChange(this, agentId, modelId);
  }

  private handleAgentModelFallbacksChange(agentId: string, fallbacks: string[]) {
    agents.handleAgentModelFallbacksChange(this, agentId, fallbacks);
  }

  private async loadAgentChannels() {
    await agents.loadAgentChannels(this);
  }

  private async loadAgentIdentity(agentId: string) {
    await agents.loadAgentIdentity(this, agentId);
  }

  private async loadAgentSkills(agentId: string) {
    await agents.loadAgentSkills(this, agentId);
  }

  private handleToolsProfileChange(agentId: string, profile: string | null, clearAllow: boolean) {
    agents.handleToolsProfileChange(this, agentId, profile, clearAllow);
  }

  private handleToolsOverridesChange(agentId: string, alsoAllow: string[], deny: string[]) {
    agents.handleToolsOverridesChange(this, agentId, alsoAllow, deny);
  }

  private handleAgentSkillToggle(agentId: string, skillName: string, enabled: boolean) {
    agents.handleAgentSkillToggle(this, agentId, skillName, enabled);
  }

  private handleAgentSkillsClear(agentId: string) {
    agents.handleAgentSkillsClear(this, agentId);
  }

  private handleAgentSkillsDisableAll(agentId: string) {
    agents.handleAgentSkillsDisableAll(this, agentId);
  }

  private async handleAddBinding(agentId: string, channelId: string, accountId?: string) {
    await agents.handleAddBinding(this, agentId, channelId, accountId);
  }

  private handleRemoveBinding(bindingIndex: number) {
    agents.handleRemoveBinding(this, bindingIndex);
  }

  private async loadAgentCron() {
    await agents.loadAgentCron(this);
  }

  // Skills handlers — delegate to app-agents-actions
  private async loadSkills() {
    await agents.loadSkills(this);
  }

  private async handleSkillToggle(skillKey: string, currentDisabled: boolean) {
    await agents.handleSkillToggle(this, skillKey, currentDisabled);
  }

  private handleSkillEdit(skillKey: string, value: string) {
    agents.handleSkillEdit(this, skillKey, value);
  }

  private async handleSkillSaveKey(skillKey: string) {
    await agents.handleSkillSaveKey(this, skillKey);
  }

  private async handleSkillInstall(skillKey: string, name: string, installId: string) {
    await agents.handleSkillInstall(this, skillKey, name, installId);
  }

  // Nodes / Config / Devices / Exec Approvals handlers — delegate to app-config-actions
  private async loadNodes() {
    await config.loadNodes(this);
  }

  private async loadDevices() {
    await config.loadDevices(this);
  }

  private async handleDeviceApprove(requestId: string) {
    await config.handleDeviceApprove(this, requestId);
  }

  private async handleDeviceReject(requestId: string) {
    await config.handleDeviceReject(this, requestId);
  }

  private async handleDeviceRotate(deviceId: string, role: string, scopes?: string[]) {
    await config.handleDeviceRotate(this, deviceId, role, scopes);
  }

  private async handleDeviceRevoke(deviceId: string, role: string) {
    await config.handleDeviceRevoke(this, deviceId, role);
  }

  private async loadConfig() {
    await config.loadConfig(this);
  }

  private handleBindDefault(nodeId: string | null) {
    config.handleBindDefault(this, nodeId);
  }

  private handleBindAgent(agentIndex: number, nodeId: string | null) {
    config.handleBindAgent(this, agentIndex, nodeId);
  }

  private async handleSaveBindings() {
    await config.handleSaveBindings(this);
  }

  private async loadExecApprovals() {
    await config.loadExecApprovals(this);
  }

  private handleExecApprovalsTargetChange(kind: "gateway" | "node", nodeId: string | null) {
    config.handleExecApprovalsTargetChange(this, kind, nodeId);
  }

  private handleExecApprovalsSelectAgent(agentId: string) {
    config.handleExecApprovalsSelectAgent(this, agentId);
  }

  private handleExecApprovalsPatch(path: Array<string | number>, value: unknown) {
    config.handleExecApprovalsPatch(this, path, value);
  }

  private handleExecApprovalsRemove(path: Array<string | number>) {
    config.handleExecApprovalsRemove(this, path);
  }

  private async handleSaveExecApprovals() {
    await config.handleSaveExecApprovals(this);
  }

  // Analytics handlers — delegate to app-analytics-actions
  private async loadAnalytics() {
    await analytics.loadAnalytics(this);
  }

  private handleAnalyticsPeriodChange(period: "1d" | "7d" | "30d" | "90d" | "custom") {
    analytics.handleAnalyticsPeriodChange(this, period);
  }

  private handleAnalyticsRangeChange(start: string, end: string) {
    analytics.handleAnalyticsRangeChange(this, start, end);
  }

  // ── Sessions handlers ─────────────────────────────────────────────────

  private async loadSessionsList() {
    await analytics.loadSessionsList(this);
  }

  private async handleSessionsPatch(
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) {
    await analytics.handleSessionsPatch(this, key, patch);
  }

  private async loadAvailableModels() {
    await analytics.loadAvailableModels(this);
  }

  private async handleThinkingChange(level: string) {
    this.chatThinkingLevel = level;
    const key = this.normalizeSessionKey(this.chatConversationId || "main");
    await this.handleSessionsPatch(key, { thinkingLevel: level === "off" ? null : level });
  }

  private async handleModelChange(modelId: string) {
    await analytics.handleModelChange(this, modelId);
    this.loadGatewaySessions();
  }

  private async handleSessionsDelete(key: string) {
    await analytics.handleSessionsDelete(this, key);
  }

  // ── Report handlers ──────────────────────────────────────────────────

  private async loadReports() {
    await analytics.loadReports(this);
  }

  private async handleReportSubmit() {
    await analytics.handleReportSubmit(this);
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
    const formatted =
      this.chatSessionTokens >= 1000
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
      workflow: "Việc định kỳ",
      billing: "Thanh toán",
      logs: "Nhật ký",
      docs: "Tài liệu",
      channels: "Kênh",
      settings: "Cài đặt",
      login: "Đăng nhập",
      agents: "Nhân viên",
      skills: "Kĩ năng",
      nodes: "Nodes",
      sessions: "Nhật ký phiên",
      report: "Góp ý",
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

    return html`
      <aside class="nav ${this.settings.navCollapsed ? "nav--collapsed" : ""}">
        <div class="nav-section">
          <div class="nav-section-title">${t("navMenu")}</div>
          <div class="nav-items">
            ${mainItems.map((item) => this.renderNavItem(item))}
          </div>
        </div>

        <div class="nav-section">
          <div class="nav-section-title">Nhân viên</div>
          <div class="nav-items">
            ${NAV_ITEMS.filter((item) => item.section === "agent").map((item) => this.renderNavItem(item))}
          </div>
        </div>

        <div class="nav-footer">
          <div class="nav-section">
            <div class="nav-items">
              ${
                this.settings.isLoggedIn
                  ? html`
                    <button
                      class="nav-item ${this.tab === "settings" ? "active" : ""}"
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
                  `
              }
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  private renderContent() {
    switch (this.tab) {
      case "chat": {
        // Convert flat tool calls to openclaw2 message format for extractToolCards
        const toolMessages = (this.chatToolCalls ?? []).map((tc) => ({
          role: tc.phase === "result" ? "toolResult" : "assistant",
          content:
            tc.phase === "result"
              ? [{ type: "tool_result", name: tc.name, text: tc.output ?? "" }]
              : [{ type: "tool_call", name: tc.name, arguments: { command: tc.detail } }],
          timestamp: Date.now(),
        }));
        // Build sessions list from gatewaySessions for the session selector
        const chatSessions: import("./types").SessionsListResult = {
          ts: Date.now(),
          path: "",
          count: this.gatewaySessions.length,
          defaults: { model: null, contextTokens: null },
          sessions: this.gatewaySessions as import("./types").GatewaySessionRow[],
        };
        const chatSessionKey = this.normalizeSessionKey(this.chatConversationId || "main");
        return html`
          <div class="chat-controls">
            <label class="chat-controls__session">
              <select
                .value=${chatSessionKey}
                ?disabled=${this.gatewayStatus !== "running" && this.gatewayStatus !== "unknown"}
                @change=${(e: Event) => {
                  const next = (e.target as HTMLSelectElement).value;
                  this.handleSessionChange(next);
                }}
              >
                ${
                  this.gatewaySessions.length === 0
                    ? html`<option value=${chatSessionKey} selected>Main session</option>`
                    : this.gatewaySessions.map(
                        (s) => html`<option value=${s.key} ?selected=${s.key === chatSessionKey}>
                        ${s.displayName ?? s.derivedTitle ?? this.shortSessionKey(s.key)}
                      </option>`,
                      )
                }
              </select>
            </label>
            <button
              class="btn btn--sm btn--icon"
              ?disabled=${this.chatSending}
              @click=${() => this.handleRefreshChat()}
              title="Refresh chat"
            >
              ${icons.refresh}
            </button>
            <button
              class="btn btn--sm btn--icon"
              @click=${() => this.handleNewConversation()}
              title="New session"
            >
              ${icons.plus}
            </button>
          </div>
          ${renderChat({
            sessionKey: chatSessionKey,
            onSessionKeyChange: (key: string) => this.handleSessionChange(key),
            thinkingLevel: null,
            showThinking: true,
            loading: false,
            sending: this.chatSending,
            canAbort: this.chatSending || Boolean(this.chatRunId),
            messages: this.chatMessages,
            toolMessages,
            stream: this.chatSending
              ? (this.chatStreamingText ?? "")
              : this.chatStreamingText || null,
            streamStartedAt: this.chatSending ? Date.now() : null,
            draft: this.chatDraft,
            queue: this.chatQueue.map((q) => ({
              id: q.id,
              text: q.text,
              createdAt: q.createdAt ?? Date.now(),
            })),
            connected: this.gatewayStatus === "running" || this.gatewayStatus === "unknown",
            canSend: true,
            disabledReason: null,
            error: null,
            sessions: chatSessions,
            focusMode: false,
            assistantName: "Operis",
            assistantAvatar: null,
            onRefresh: () => this.handleRefreshChat(),
            onToggleFocusMode: () => {},
            onDraftChange: (value) => (this.chatDraft = value),
            onSend: () => this.handleSendMessage(),
            onAbort: () => this.handleStopChat(),
            onQueueRemove: (id: string) => this.removeQueuedMessage(id),
            onNewSession: () => this.handleNewConversation(),
            onChatScroll: (e: Event) => {
              const el = e.target as HTMLElement;
              this.chatAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            },
            onScrollToBottom: this.chatAtBottom ? undefined : () => this.scrollChatToBottom(),
            attachments: this.chatAttachments,
            onAttachmentsChange: (atts) => {
              this.chatAttachments = atts;
            },
            compactionStatus: this.chatCompactionActive
              ? { active: true, startedAt: Date.now(), completedAt: null }
              : null,
          })}
        `;
      }
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
          onRangeChange: (start: string, end: string) =>
            this.handleAnalyticsRangeChange(start, end),
          onRefresh: () => this.loadAnalytics(),
        });
      case "billing":
        return renderBilling({
          creditBalance: this.currentUser?.token_balance ?? 0,
          freeTokenBalance: this.currentUser?.free_token_balance ?? 0,
          freeResetAt: this.billingFreeResetAt,
          // Payment mode
          paymentMode: this.billingPaymentMode,
          onPaymentModeChange: (mode) => {
            this.billingPaymentMode = mode;
            this.requestUpdate();
          },
          // Pricing tiers from API
          pricingTiers: this.billingPricingTiers,
          pricingLoading: this.billingPricingLoading,
          selectedPackage: this.billingSelectedPackage,
          onSelectPackage: (i: number) => {
            this.billingSelectedPackage = i;
            this.requestUpdate();
          },
          // Custom amount
          customAmount: this.billingCustomAmount,
          onCustomAmountChange: (v) => {
            this.billingCustomAmount = v;
            this.requestUpdate();
          },
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
          onToggleAutoTopUp: () => (this.billingAutoTopUp = !this.billingAutoTopUp),
          // History
          depositHistory: this.billingDepositHistory.slice(
            (this.billingHistoryPage - 1) * this.billingHistoryPageSize,
            this.billingHistoryPage * this.billingHistoryPageSize,
          ),
          historyLoading: this.billingHistoryLoading,
          historyPage: this.billingHistoryPage,
          historyTotalPages: Math.ceil(
            this.billingDepositHistory.length / this.billingHistoryPageSize,
          ),
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
          onCancel: (w) => this.handleWorkflowCancel(w),
          onEdit: (w) => this.handleWorkflowEdit(w),
          onDelete: (w) => this.handleWorkflowDelete(w),
          detailWorkflow: this.workflowDetailWorkflow,
          onOpenWorkflowDetail: (w) => {
            this.workflowDetailWorkflow = w;
          },
          onCloseWorkflowDetail: () => {
            this.workflowDetailWorkflow = null;
          },
          runningWorkflowIds: this.runningWorkflowIds,
          // Split panel
          selectedWorkflowId: this.selectedWorkflowId,
          progressMap: this.progressMap,
          onSelectWorkflow: (id: string | null) => {
            this.selectedWorkflowId = id;
            // Auto-load run history when selecting idle workflow
            if (id && !this.progressMap.has(id)) {
              this.loadWorkflowRuns(id);
            }
          },
          // Run history
          runsWorkflowId: this.workflowRunsId,
          runs: this.workflowRuns,
          runsLoading: this.workflowRunsLoading,
          onLoadRuns: (id: string | null) => this.loadWorkflowRuns(id),
          editingWorkflowId: this.editingWorkflowId,
          showForm: this.workflowShowForm,
          onToggleForm: () => {
            this.workflowShowForm = !this.workflowShowForm;
            if (this.workflowShowForm) {
              this.editingWorkflowId = null;
              this.workflowForm = { ...DEFAULT_WORKFLOW_FORM };
            }
          },
          modalRun: this.workflowModalRun,
          onOpenRunDetail: (run) => {
            this.workflowModalRun = run;
          },
          onCloseRunDetail: () => {
            this.workflowModalRun = null;
          },
        });
      case "docs":
        return renderDocs({
          selectedSlug: this.docsSelectedSlug,
          onSelectDoc: (slug: string) => {
            this.docsSelectedSlug = slug;
          },
          onBack: () => {
            this.docsSelectedSlug = null;
          },
        });
      case "channels":
        return renderChannels({
          channels: this.channels,
          loading: this.channelsLoading,
          error: this.channelsError ?? undefined,
          connectingChannel: this.channelsConnecting ?? undefined,
          zaloQrBase64: this.zaloQrBase64,
          zaloQrStatus: this.zaloQrStatus,
          onConnect: (channel) => this.handleChannelConnect(channel),
          onDisconnect: (channel) => this.handleChannelDisconnect(channel),
          onRefresh: () => this.loadChannels(),
          onCancelZaloQr: () => {
            this.stopZaloPolling();
            this.channelsConnecting = null;
          },
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
          zaloQrBase64: this.zaloQrBase64,
          zaloQrStatus: this.zaloQrStatus,
          onConnectChannel: (channel) => this.handleChannelConnect(channel),
          onDisconnectChannel: (channel) => this.handleChannelDisconnect(channel),
          onRefreshChannels: () => this.loadChannels(),
          onCancelZaloQr: () => {
            this.stopZaloPolling();
            this.channelsConnecting = null;
          },
          // Security
          showPasswordForm: this.settingsShowPasswordForm,
          onTogglePasswordForm: () =>
            (this.settingsShowPasswordForm = !this.settingsShowPasswordForm),
          onChangePassword: (current, newPwd) => this.handleChangePassword(current, newPwd),
          // API Key
          apiKeyValue: this.settingsApiKey,
          apiKeyLoading: this.settingsApiKeyLoading,
          apiKeySaving: this.settingsApiKeySaving,
          apiKeyHasKey: this.settingsApiKeyHasKey,
          onApiKeyChange: (value) => (this.settingsApiKey = value),
          onSaveApiKey: () => this.handleSaveApiKey(),
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
          onSelectPanel: (panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron") =>
            this.handleSelectPanel(panel),
          onLoadFiles: (id: string) => this.loadAgentFiles(id),
          onSelectFile: (name: string) => this.handleSelectFile(name),
          onFileDraftChange: (name: string, content: string) =>
            this.handleFileDraftChange(name, content),
          onFileReset: (name: string) => this.handleFileReset(name),
          onFileSave: (name: string) => this.handleFileSave(name),
          onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) =>
            this.handleToolsProfileChange(agentId, profile, clearAllow),
          onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) =>
            this.handleToolsOverridesChange(agentId, alsoAllow, deny),
          onConfigReload: () => this.loadAgentConfig(),
          onConfigSave: () => this.saveAgentConfig(),
          onModelChange: (agentId: string, modelId: string | null) =>
            this.handleAgentModelChange(agentId, modelId),
          onModelFallbacksChange: (agentId: string, fallbacks: string[]) =>
            this.handleAgentModelFallbacksChange(agentId, fallbacks),
          onChannelsRefresh: () => this.loadAgentChannels(),
          onAddBinding: (agentId: string, channelId: string, accountId?: string) =>
            this.handleAddBinding(agentId, channelId, accountId),
          onRemoveBinding: (bindingIndex: number) => this.handleRemoveBinding(bindingIndex),
          onCronRefresh: () => this.loadAgentCron(),
          onSkillsFilterChange: (next: string) => {
            this.agentSkillsFilter = next;
          },
          onSkillsRefresh: () => {
            if (this.agentSelectedId) this.loadAgentSkills(this.agentSelectedId);
          },
          onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) =>
            this.handleAgentSkillToggle(agentId, skillName, enabled),
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
          onInstall: (key: string, name: string, installId: string) =>
            this.handleSkillInstall(key, name, installId),
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
          onDeviceRotate: (deviceId: string, role: string, scopes?: string[]) =>
            this.handleDeviceRotate(deviceId, role, scopes),
          onDeviceRevoke: (deviceId: string, role: string) =>
            this.handleDeviceRevoke(deviceId, role),
          onLoadConfig: () => this.loadConfig(),
          onLoadExecApprovals: () => this.loadExecApprovals(),
          onBindDefault: (nodeId: string | null) => this.handleBindDefault(nodeId),
          onBindAgent: (agentIndex: number, nodeId: string | null) =>
            this.handleBindAgent(agentIndex, nodeId),
          onSaveBindings: () => this.handleSaveBindings(),
          onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) =>
            this.handleExecApprovalsTargetChange(kind, nodeId),
          onExecApprovalsSelectAgent: (agentId: string) =>
            this.handleExecApprovalsSelectAgent(agentId),
          onExecApprovalsPatch: (path: Array<string | number>, value: unknown) =>
            this.handleExecApprovalsPatch(path, value),
          onExecApprovalsRemove: (path: Array<string | number>) =>
            this.handleExecApprovalsRemove(path),
          onSaveExecApprovals: () => this.handleSaveExecApprovals(),
        });
      case "report":
        return renderReportView({
          reports: this.reports,
          loading: this.reportLoading,
          error: this.reportError,
          form: this.reportForm,
          submitting: this.reportSubmitting,
          onFormChange: (patch) => (this.reportForm = { ...this.reportForm, ...patch }),
          onSubmit: () => this.handleReportSubmit(),
          onRefresh: () => this.loadReports(),
        });
      case "sessions":
        return renderSessions({
          loading: this.sessionsLoading,
          result: this.sessionsResult as any,
          error: this.sessionsError,
          activeMinutes: this.sessionsActiveMinutes,
          limit: this.sessionsLimit,
          includeGlobal: this.sessionsIncludeGlobal,
          includeUnknown: this.sessionsIncludeUnknown,
          basePath: "",
          agents: (this.agentsList?.agents ?? []).map((a) => ({
            id: a.id,
            name: a.name || a.id,
          })),
          onFiltersChange: (next) => {
            this.sessionsActiveMinutes = next.activeMinutes;
            this.sessionsLimit = next.limit;
            this.sessionsIncludeGlobal = next.includeGlobal;
            this.sessionsIncludeUnknown = next.includeUnknown;
            this.loadSessionsList();
          },
          onRefresh: () => this.loadSessionsList(),
          onPatch: (key, patch) => this.handleSessionsPatch(key, patch),
          onDelete: (key) => this.handleSessionsDelete(key),
          onOpenSession: (key) => {
            this.setTab("chat");
            void this.handleSessionChange(key);
          },
          onCreateSession: (key) => {
            this.setTab("chat");
            void this.handleSessionChange(key);
          },
        });
      default:
        return nothing;
    }
  }

  render() {
    return html`
      <div
        class="shell ${
          this.settings.navCollapsed || this.tab === "login" ? "shell--nav-collapsed" : ""
        }"
      >
        <header class="topbar">
          <div class="topbar-left">
            ${
              this.tab !== "login"
                ? html`
                  <button
                    class="nav-collapse-toggle"
                    @click=${() => this.toggleNav()}
                    title="${this.settings.navCollapsed ? "Mở rộng" : "Thu gọn"}"
                  >
                    <span class="nav-collapse-toggle__icon">${icons.menu}</span>
                  </button>
                `
                : nothing
            }
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
            ${
              this.settings.isLoggedIn
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
                : nothing
            }
          </div>
        </header>

        ${this.tab !== "login" ? this.renderNavigation() : nothing}

        <main class="content ${this.tab === "login" ? "content--no-scroll" : ""}">
          ${
            this.tab !== "login" && this.tab !== "chat"
              ? html`
                <section class="content-header">
                  <div>
                    <div class="page-title">${titleForTab(this.tab)}</div>
                    <div class="page-sub">${subtitleForTab(this.tab)}</div>
                  </div>
                </section>
              `
              : nothing
          }

          ${
            this.settings.isLoggedIn &&
            this.gatewayStatus !== "running" &&
            this.gatewayStatus !== "unknown"
              ? html`
              <div class="gw-banner gw-banner--${this.gatewayStatus}">
                <span class="gw-banner__icon">
                  ${this.gatewayStatus === "error" ? "\u26A0" : "\u27F3"}
                </span>
                <span class="gw-banner__text">
                  ${
                    this.gatewayStatus === "starting"
                      ? "Đang khởi động gateway..."
                      : this.gatewayStatus === "stopped"
                        ? "Gateway đã dừng"
                        : this.gatewayStatus === "error"
                          ? "Lỗi khởi động gateway"
                          : "Đang kết nối..."
                  }
                </span>
              </div>`
              : nothing
          }

          ${this.renderContent()}
        </main>

        ${this.renderTelegramTokenModal()}
      </div>
    `;
  }

  private renderTelegramTokenModal() {
    if (!this.telegramTokenModal) return nothing;
    return html`
      <style>
        .tg-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .tg-modal { background: var(--card); border-radius: var(--radius-lg); padding: 24px; width: 420px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .tg-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .tg-modal-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-strong); }
        .tg-close-btn { background: none; border: none; font-size: 24px; color: var(--muted); cursor: pointer; padding: 0 4px; line-height: 1; }
        .tg-close-btn:hover { color: var(--text-strong); }
        .tg-instruction { font-size: 14px; color: var(--muted); margin: 0 0 16px; line-height: 1.5; }
        .tg-instruction a { color: #0088cc; text-decoration: none; }
        .tg-instruction a:hover { text-decoration: underline; }
        .tg-instruction code { background: var(--bg-muted); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
        .tg-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font-size: 14px; font-family: monospace; box-sizing: border-box; }
        .tg-input:focus { outline: none; border-color: #0088cc; box-shadow: 0 0 0 2px rgba(0, 136, 204, 0.2); }
        .tg-input.tg-err { border-color: #ef4444; }
        .tg-error-msg { font-size: 13px; color: #ef4444; margin: 8px 0 0; }
        .tg-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
        .tg-actions .btn { min-width: 80px; }
      </style>
      <div class="tg-overlay" @click=${() => this.handleTelegramTokenCancel()}>
        <div class="tg-modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="tg-modal-header">
            <h3>Kết nối Telegram</h3>
            <button class="tg-close-btn" @click=${() => this.handleTelegramTokenCancel()}>&times;</button>
          </div>
          <p class="tg-instruction">
            Nhập Bot Token từ
            <a href="https://t.me/BotFather" target="_blank">@BotFather</a>
            trên Telegram. Tạo bot mới bằng lệnh <code>/newbot</code> để lấy token.
          </p>
          <input
            class="tg-input ${this.telegramTokenError ? "tg-err" : ""}"
            type="text"
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            .value=${this.telegramTokenValue}
            @input=${(e: Event) => (this.telegramTokenValue = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !this.telegramTokenSaving) this.handleTelegramTokenSave();
            }}
            ?disabled=${this.telegramTokenSaving}
          />
          ${this.telegramTokenError ? html`<p class="tg-error-msg">${this.telegramTokenError}</p>` : nothing}
          <div class="tg-actions">
            <button class="btn btn-secondary" @click=${() => this.handleTelegramTokenCancel()} ?disabled=${this.telegramTokenSaving}>
              Hủy
            </button>
            <button
              class="btn btn-primary"
              style="background: #0088cc; border-color: #0088cc;"
              @click=${() => this.handleTelegramTokenSave()}
              ?disabled=${this.telegramTokenSaving || !this.telegramTokenValue.trim()}
            >
              ${this.telegramTokenSaving ? "Đang lưu..." : "Lưu & Kết nối"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
