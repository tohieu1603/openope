import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
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
import type { ReportFormState } from "./views/report";
import type { Workflow, WorkflowFormState, CronProgressState } from "./workflow-types";
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
  connectChannel,
  disconnectChannel,
  CHANNEL_DEFINITIONS,
  type ChannelStatus,
  type ChannelId,
} from "./channels-api";
import { getConversations, deleteConversation, type Conversation } from "./chat-api";
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
import {
  subscribeToCronEvents,
  subscribeToChatStream,
  subscribeToToolEvents,
  subscribeToLifecycleEvents,
  subscribeToCompactionEvents,
  stopGatewayClient,
  waitForConnection,
  getGatewayClient,
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
import { createReport, getMyReports, getAllReports, type FeedbackReport } from "./report-api";
import { loadSettings, saveSettings, type ClientSettings } from "./storage";
import {
  resolveTheme,
  applyTheme,
  getSystemTheme,
  type ThemeMode,
  type ResolvedTheme,
} from "./theme";
import { startThemeTransition, type ThemeTransitionContext } from "./theme-transition";
import { getTokenBalance } from "./tokens-api";
import { startUsageTracker, stopUsageTracker, reportCronUsage } from "./usage-tracker";
import { getUserProfile, updateUserProfile, changePassword, type UserProfile } from "./user-api";
import { renderAgents } from "./views/agents";
import { renderAnalytics } from "./views/analytics";
import { renderBilling } from "./views/billing";
import { renderChannels } from "./views/channels";
import { renderChat, type PendingImage } from "./views/chat";
import { renderDocs } from "./views/docs";
import { renderLogin } from "./views/login";
import { renderLogs, type LogEntry } from "./views/logs";
import { renderNodes } from "./views/nodes";
import { renderReportView } from "./views/report";
import { renderSessions } from "./views/sessions";
import { renderSettings } from "./views/settings";
import { renderSkills } from "./views/skills";
import { renderWorkflow } from "./views/workflow";
import {
  listWorkflows,
  createWorkflow,
  toggleWorkflow,
  runWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  getWorkflowStatus,
  seedDefaultWorkflows,
  type WorkflowStatus,
} from "./workflow-api";
// Register custom components
import "./components/operis-input";
import "./components/operis-select";
import "./components/operis-modal";
import "./components/operis-datetime-picker";
import "./components/operis-confirm";
import { DEFAULT_WORKFLOW_FORM } from "./workflow-types";
import { getZaloStatus } from "./zalo-api";

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
    sessions: "Sessions",
    report: "Góp Ý",
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
    sessions: "Inspect active sessions and adjust per-session defaults.",
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

  // Chat state
  @state() chatMessages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: Date;
    images?: Array<{ preview: string }>;
  }> = [];
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
  // Session token tracking
  @state() chatSessionTokens = 0;
  // Thinking level from gateway session (off | low | medium | high)
  @state() chatThinkingLevel: string | null = null;
  @state() chatTokenBalance = 0;
  // Current chat run ID for abort
  private chatRunId: string | null = null;
  // Run dedup maps (matching TUI tui-event-handlers.ts)
  private finalizedRuns = new Map<string, number>();
  private sessionRuns = new Map<string, number>();
  private localRunIds = new Set<string>();
  private lastTrackedSessionKey: string | null = null;
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
  private compactionClearTimer: ReturnType<typeof setTimeout> | null = null;
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
  private zaloPollingTimer: ReturnType<typeof setInterval> | null = null;

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
  private reconnectUnsubscribe: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Clean up legacy localStorage tokens (now using HttpOnly cookies)
    localStorage.removeItem("operis_accessToken");
    localStorage.removeItem("operis_refreshToken");

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
      console.log("[app] gateway reconnected — resetting chat state and reloading");
      // Reset orphaned chat run state (any in-flight run's final event was lost during disconnect)
      this.chatRunId = null;
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatToolCalls = [];
      this.chatSending = false;
      // Clear run tracking maps (like TUI syncSessionKey on reconnect)
      this.finalizedRuns.clear();
      this.sessionRuns.clear();
      this.localRunIds.clear();
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

  // --- Run tracking helpers (matching TUI tui-event-handlers.ts) ---

  /** Prune a run map when it exceeds 200 entries (keep 150, evict oldest). */
  private pruneRunMap(runs: Map<string, number>) {
    if (runs.size <= 200) return;
    const keepUntil = Date.now() - 10 * 60 * 1000;
    for (const [key, ts] of runs) {
      if (runs.size <= 150) break;
      if (ts < keepUntil) runs.delete(key);
    }
    if (runs.size > 200) {
      for (const key of runs.keys()) {
        runs.delete(key);
        if (runs.size <= 150) break;
      }
    }
  }

  /** Clear run maps when session changes (like TUI syncSessionKey). */
  private syncRunTracking() {
    const currentKey = this.chatConversationId || "main";
    if (currentKey === this.lastTrackedSessionKey) return;
    this.lastTrackedSessionKey = currentKey;
    this.finalizedRuns.clear();
    this.sessionRuns.clear();
    this.localRunIds.clear();
  }

  private noteSessionRun(runId: string) {
    this.sessionRuns.set(runId, Date.now());
    this.pruneRunMap(this.sessionRuns);
  }

  private noteFinalizedRun(runId: string) {
    this.finalizedRuns.set(runId, Date.now());
    this.sessionRuns.delete(runId);
    this.localRunIds.delete(runId);
    this.pruneRunMap(this.finalizedRuns);
  }

  /** Check if a run is known (active, in-session, or recently finalized). */
  private isKnownRun(runId: string): boolean {
    return runId === this.chatRunId || this.sessionRuns.has(runId) || this.finalizedRuns.has(runId);
  }

  private handleToolEvent(evt: ToolEvent) {
    // Filter by known runs (like TUI: active + sessionRuns + finalizedRuns)
    if (!this.isKnownRun(evt.runId)) return;
    const { phase, toolCallId, name, isError, args, result, partialResult } = evt.data;
    if (!toolCallId) return;

    const detail = this.extractToolDetail(name, args);
    // Capture tool output (like original formatToolOutput)
    const rawOutput = phase === "result" ? result : phase === "update" ? partialResult : undefined;
    const output = rawOutput !== undefined ? this.formatToolOutput(rawOutput) : undefined;

    const existing = this.chatToolCalls.findIndex((t) => t.id === toolCallId);
    if (phase === "start" && existing < 0) {
      this.chatToolCalls = [
        ...this.chatToolCalls,
        { id: toolCallId, name: name ?? "tool", phase: "start", detail },
      ];
    } else if (existing >= 0) {
      const updated = [...this.chatToolCalls];
      updated[existing] = {
        ...updated[existing],
        phase,
        isError,
        ...(detail ? { detail } : {}),
        ...(output !== undefined ? { output } : {}),
      };
      this.chatToolCalls = updated;
    }

    // Trim to 50 entries max (like original TOOL_STREAM_LIMIT)
    if (this.chatToolCalls.length > 50) {
      this.chatToolCalls = this.chatToolCalls.slice(-50);
    }
  }

  /** Format tool output to string (like original formatToolOutput). */
  private formatToolOutput(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") return value.slice(0, 120_000);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    // Extract text from content blocks
    if (typeof value === "object") {
      const rec = value as Record<string, unknown>;
      if (typeof rec.text === "string") return rec.text.slice(0, 120_000);
      if (Array.isArray(rec.content)) {
        const parts = (rec.content as Array<Record<string, unknown>>)
          .filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text as string);
        if (parts.length > 0) return parts.join("\n").slice(0, 120_000);
      }
    }
    try {
      return JSON.stringify(value, null, 2).slice(0, 120_000);
    } catch {
      return String(value);
    }
  }

  /** Extract a short human-readable detail from tool args (e.g. "navigate · google.com") */
  private extractToolDetail(name: string | undefined, args: unknown): string | undefined {
    if (!args || typeof args !== "object") return undefined;
    const a = args as Record<string, unknown>;

    // Browser tool: action + url/value
    if (name === "browser") {
      const action = typeof a.action === "string" ? a.action : undefined;
      if (!action) return undefined;
      const url = typeof a.url === "string" ? a.url : undefined;
      if (url) {
        try {
          const host = new URL(url).hostname.replace(/^www\./, "");
          return `${action} · ${host}`;
        } catch {
          return `${action} · ${url.slice(0, 40)}`;
        }
      }
      const value = typeof a.value === "string" ? a.value : undefined;
      if (value) return `${action} · ${value.slice(0, 40)}`;
      const ref = typeof a.ref === "string" ? a.ref : undefined;
      if (ref) return `${action} · ${ref}`;
      return action;
    }

    // Shell/bash tools: show command snippet
    if (name === "shell" || name === "bash" || name === "execute_command") {
      const cmd = typeof a.command === "string" ? a.command : undefined;
      if (cmd) return cmd.length > 50 ? cmd.slice(0, 47) + "…" : cmd;
    }

    // File tools: show path
    if (name === "read_file" || name === "write_file" || name === "edit_file") {
      const path =
        typeof a.path === "string"
          ? a.path
          : typeof a.file_path === "string"
            ? a.file_path
            : undefined;
      if (path) {
        const short = path.split("/").slice(-2).join("/");
        return short;
      }
    }

    // Search tools
    if (name === "search" || name === "grep" || name === "web_search") {
      const query =
        typeof a.query === "string"
          ? a.query
          : typeof a.pattern === "string"
            ? a.pattern
            : undefined;
      if (query) return query.length > 50 ? query.slice(0, 47) + "…" : query;
    }

    // Generic: try action field
    const action = typeof a.action === "string" ? a.action : undefined;
    if (action) return action;

    return undefined;
  }

  private handleChatStreamEvent(evt: ChatStreamEvent) {
    // SSE streaming sets chatStreamingRunId = "sse-stream", skip WS events in that case
    if (this.chatStreamingRunId === "sse-stream") return;
    this.syncRunTracking();
    // Filter by session key (like TUI: only process events for active session)
    // Gateway broadcasts the exact sessionKey the client sent in chat.send, so compare
    // using the same format. Normalize both to full key to handle "main" vs "agent:main:main".
    if (evt.sessionKey) {
      const evtKey = this.normalizeSessionKey(evt.sessionKey);
      const currentKey = this.normalizeSessionKey(this.chatConversationId || "main");
      if (evtKey !== currentKey) return;
    }
    // Dedup: skip delta/final for already-finalized runs
    if (this.finalizedRuns.has(evt.runId)) {
      if (evt.state === "delta" || evt.state === "final") return;
    }
    this.noteSessionRun(evt.runId);
    // Auto-assign chatRunId if we receive events without an active run (like TUI)
    if (!this.chatRunId) {
      this.chatRunId = evt.runId;
    }

    if (evt.state === "delta" && evt.message?.content) {
      const text = evt.message.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("");

      this.chatStreamingText = text;
      this.chatStreamingRunId = evt.runId;
    } else if (evt.state === "final") {
      this.handleChatFinal(evt);
    } else if (evt.state === "aborted") {
      this.noteFinalizedRun(evt.runId);
      this.chatRunId = null;
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatToolCalls = [];
      this.chatSending = false;
      // Reload history if not a local run (event from another client)
      if (!this.localRunIds.has(evt.runId)) {
        this.loadChatMessagesFromGateway();
      }
      this.flushChatQueue();
    } else if (evt.state === "error") {
      const errorMsg = evt.errorMessage || "Có lỗi xảy ra khi xử lý tin nhắn";
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date() },
      ];
      this.noteFinalizedRun(evt.runId);
      this.chatRunId = null;
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatToolCalls = [];
      this.chatSending = false;
      if (!this.localRunIds.has(evt.runId)) {
        this.loadChatMessagesFromGateway();
      }
      this.flushChatQueue();
    }
  }

  /** Handle agent lifecycle events (start/end/error) like TUI. */
  private handleLifecycleEvent(evt: LifecycleEvent) {
    // Only process for active run (like TUI)
    if (evt.runId !== this.chatRunId) return;
    const phase = evt.data?.phase;
    if (phase === "start") {
      // Agent started running — chatRunId is already set
    } else if (phase === "end") {
      // Agent finished — final chat event will handle cleanup
    } else if (phase === "error") {
      // Agent errored — final/error chat event will handle cleanup
    }
  }

  /** Handle final chat event — append message, reset state, flush queue (like TUI). */
  private handleChatFinal(evt: ChatStreamEvent) {
    const finalText =
      evt.message?.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("") || this.chatStreamingText;

    // If not a local run, reload history to get server-side formatting
    if (!this.localRunIds.has(evt.runId)) {
      this.loadChatMessagesFromGateway();
    } else if (finalText) {
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", content: finalText, timestamp: new Date() },
      ];
    }

    // Accumulate WS token usage
    const wsUsage = evt.usage ?? evt.message?.usage;
    if (wsUsage) {
      this.chatSessionTokens +=
        wsUsage.totalTokens || (wsUsage.input || 0) + (wsUsage.output || 0) || 0;
    }

    this.noteFinalizedRun(evt.runId);
    this.chatRunId = null;
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatToolCalls = [];
    this.chatSending = false;

    // Cache to sessionStorage as backup.
    this.cacheChatMessages();

    // Refresh session selector (new sessions may have been created)
    this.loadGatewaySessions();

    // Flush queued messages (like original flushChatQueueForEvent)
    this.flushChatQueue();

    // Fetch updated token balance (fire-and-forget)
    getTokenBalance()
      .then((bal) => {
        this.chatTokenBalance = bal.balance;
        if (this.currentUser) {
          this.currentUser = { ...this.currentUser, token_balance: bal.balance };
        }
      })
      .catch(() => {});
  }

  // --- Chat message cache (localStorage — survives reload AND shared across tabs) ---
  private static readonly CHAT_CACHE_KEY = "operis-chat-messages";

  /** Save current messages to localStorage so they survive page reload and sync across tabs. */
  private cacheChatMessages() {
    try {
      const sessionKey = this.chatConversationId || "main";
      const data = {
        sessionKey,
        cachedAt: Date.now(),
        messages: this.chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp?.toISOString(),
        })),
      };
      localStorage.setItem(OperisApp.CHAT_CACHE_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota errors */
    }
  }

  /** Restore messages from localStorage cache (returns true if cache was used). */
  private restoreCachedMessages(): boolean {
    try {
      const raw = localStorage.getItem(OperisApp.CHAT_CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const sessionKey = this.chatConversationId || "main";
      if (data.sessionKey !== sessionKey) return false;
      if (!Array.isArray(data.messages) || data.messages.length === 0) return false;
      // Skip stale cache (older than 24h)
      if (data.cachedAt && Date.now() - data.cachedAt > 24 * 60 * 60 * 1000) return false;
      this.chatMessages = data.messages.map((m: Record<string, string>) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      }));
      return true;
    } catch {
      return false;
    }
  }

  // --- Chat queue (like original app-chat.ts) ---

  /** Check if chat is busy (sending request OR waiting for run to finish). */
  private isChatBusy() {
    return this.chatSending || Boolean(this.chatRunId);
  }

  /** Add message to queue (sent when current run finishes). */
  private enqueueChatMessage(text: string, images?: PendingImage[]) {
    const trimmed = text.trim();
    if (!trimmed && (!images || images.length === 0)) return;
    this.chatQueue = [
      ...this.chatQueue,
      { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now(), images },
    ];
  }

  /** Flush first queued message — called after final/aborted events (like original). */
  private async flushChatQueue() {
    if (this.isChatBusy() || this.chatQueue.length === 0) return;
    const [next, ...rest] = this.chatQueue;
    this.chatQueue = rest;
    // Re-use handleSendMessage logic but with queued content
    this.chatDraft = next.text;
    this.chatPendingImages = next.images ?? [];
    await this.handleSendMessage();
    // If send failed (chatSending still false), restore queue
    if (!this.chatSending && !this.isChatBusy()) {
      // Send didn't start — put it back
      if (this.chatDraft === next.text) {
        this.chatDraft = "";
        this.chatQueue = [next, ...this.chatQueue];
      }
    }
  }

  /** Remove a queued message by id (like original removeQueuedMessage). */
  private removeQueuedMessage(id: string) {
    this.chatQueue = this.chatQueue.filter((item) => item.id !== id);
  }

  // --- Compaction event handler (like original app-tool-stream.ts) ---

  private handleCompactionEvent(evt: CompactionEvent) {
    // Clear any existing auto-dismiss timer
    if (this.compactionClearTimer) {
      clearTimeout(this.compactionClearTimer);
      this.compactionClearTimer = null;
    }
    if (evt.phase === "start") {
      this.chatCompactionActive = true;
    } else if (evt.phase === "end") {
      this.chatCompactionActive = false;
      // Auto-clear after 5s (like original COMPACTION_TOAST_DURATION_MS)
      this.compactionClearTimer = setTimeout(() => {
        this.chatCompactionActive = false;
        this.compactionClearTimer = null;
      }, 5000);
    }
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
    this.stopGatewayServices();
    this.stopBillingCountdown();
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
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
  private async loadGatewaySessions() {
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
      }
    } catch (err) {
      console.error("[chat] Failed to load gateway sessions:", err);
    }
  }

  /** Normalize session key: "main" → "agent:main:main", passthrough if already full key */
  private normalizeSessionKey(key: string): string {
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

  /** Switch to a different gateway session */
  private async handleSessionChange(key: string) {
    const fullKey = this.normalizeSessionKey(key);
    const currentFull = this.normalizeSessionKey(this.chatConversationId || "main");
    if (fullKey === currentFull) return;

    // Store full key so chat.history receives the exact key from sessions.list
    this.chatConversationId = fullKey;
    this.chatMessages = [];
    this.chatStreamingText = "";
    this.chatToolCalls = [];
    this.persistSessionKey(fullKey);
    console.log("[session] switching to:", fullKey);
    await this.loadChatMessagesFromGateway(true);
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
    const hasDraft = this.chatDraft.trim() || this.chatPendingImages.length > 0;
    if (!hasDraft) return;

    // Queue if busy (like original — enqueueChatMessage when isChatBusy)
    if (this.isChatBusy()) {
      this.enqueueChatMessage(
        this.chatDraft,
        this.chatPendingImages.length > 0 ? [...this.chatPendingImages] : undefined,
      );
      this.chatDraft = "";
      this.chatPendingImages = [];
      return;
    }

    const userMessage = this.chatDraft.trim();
    const images = this.chatPendingImages.length > 0 ? [...this.chatPendingImages] : undefined;
    this.chatDraft = "";
    this.chatPendingImages = [];
    this.chatSending = true;
    this.chatError = null;
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatToolCalls = [];

    // Detect /new or /reset → clear messages before sending (gateway will create new transcript)
    const isResetCommand = /^\/(new|reset)\b/i.test(userMessage);
    if (isResetCommand) {
      this.chatMessages = [];
      this.chatSessionTokens = 0;
      this.cacheChatMessages();
    }

    // Add user message (with image previews if any)
    this.chatMessages = [
      ...this.chatMessages,
      {
        role: "user",
        content: userMessage,
        timestamp: new Date(),
        ...(images ? { images: images.map((img) => ({ preview: img.preview })) } : {}),
      },
    ];
    this.cacheChatMessages();
    await this.scrollChatToBottom();

    try {
      const gw = await waitForConnection(5000);
      const runId = crypto.randomUUID();
      this.chatRunId = runId;
      this.localRunIds.add(runId);
      await gw.request(
        "chat.send",
        {
          sessionKey: this.chatConversationId || "main",
          message: userMessage,
          deliver: false,
          idempotencyKey: runId,
          ...(this.chatThinkingLevel ? { thinking: this.chatThinkingLevel } : {}),
          ...(images?.length
            ? {
                attachments: images.map((img) => ({
                  type: "image",
                  mimeType: img.mimeType,
                  content: img.data,
                })),
              }
            : {}),
        },
        30_000,
      );
      // chat.send returns immediately. Streaming via handleChatStreamEvent.
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Không thể gửi tin nhắn";
      this.chatError = errorMsg;
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date() },
      ];
      this.chatRunId = null;
      this.chatStreamingText = "";
      this.chatStreamingRunId = null;
      this.chatToolCalls = [];
    } finally {
      // Original: chatSending = false in finally, chatRunId stays until final/aborted/error
      this.chatSending = false;
    }
  }

  private handleStopChat() {
    // Save partial response so user sees where it stopped
    const partialText = this.chatStreamingText;
    if (partialText) {
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant" as const, content: partialText, timestamp: new Date() },
      ];
    }
    // Abort via gateway WS (with specific runId like OpenClaw TUI)
    const gw = getGatewayClient();
    if (gw.connected && this.chatRunId) {
      gw.request("chat.abort", {
        sessionKey: this.chatConversationId || "main",
        runId: this.chatRunId,
      }).catch(() => {});
    }
    this.chatRunId = null;
    this.chatStreamingText = "";
    this.chatStreamingRunId = null;
    this.chatToolCalls = [];
    this.chatSending = false;
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
    if (sessionParam) {
      this.chatConversationId = sessionParam;
      this.persistSessionKey(sessionParam);
    } else if (this.settings.lastSessionKey && this.settings.lastSessionKey !== "main") {
      this.chatConversationId = this.settings.lastSessionKey;
    }
    // Sync URL to include session param on chat tab
    this.syncSessionUrl();
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
  private async loadChatMessagesFromGateway(isInitialLoad = false) {
    // Show cache as placeholder while gateway loads (instant UI, no blank screen)
    if (isInitialLoad) {
      this.restoreCachedMessages();
    }

    try {
      const gw = await waitForConnection(5000);
      const sessionKey = this.chatConversationId || "main";
      const res = await gw.request<{
        messages?: Array<Record<string, unknown>>;
        thinkingLevel?: string;
        sessionId?: string;
      }>("chat.history", { sessionKey, limit: 200 });

      const rawMessages = Array.isArray(res.messages) ? res.messages : [];
      console.log("[chat] history response:", {
        sessionKey,
        sessionId: res.sessionId,
        messageCount: rawMessages.length,
      });

      // Parse gateway content blocks → flat string format used by client-web2
      const parsed = rawMessages
        .map((msg) => {
          const role = (msg.role === "user" ? "user" : "assistant") as "user" | "assistant";
          let content = "";
          if (typeof msg.content === "string") {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            content = (msg.content as Array<Record<string, unknown>>)
              .filter((block) => block.type === "text" && typeof block.text === "string")
              .map((block) => block.text as string)
              .join("\n");
          }
          const ts = typeof msg.timestamp === "number" ? new Date(msg.timestamp) : undefined;
          return { role, content, timestamp: ts };
        })
        .filter((m) => m.content);

      // Gateway is source of truth — always replace local state
      this.chatMessages = parsed;
      // Store thinking level from session (used in chat.send)
      if (typeof res.thinkingLevel === "string") {
        this.chatThinkingLevel = res.thinkingLevel;
      }
      this.cacheChatMessages();
    } catch (err) {
      console.warn("[chat] Failed to load messages from gateway:", err);
      // If gateway failed and we have no messages, try cache as fallback
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

  // Workflow handlers
  private async loadWorkflows(silent = false) {
    if (!silent) {
      this.workflowLoading = true;
      this.workflowError = null;
    }
    const startTime = Date.now();
    try {
      // Load both workflows and status in parallel
      const [workflows, status] = await Promise.all([listWorkflows(), getWorkflowStatus()]);
      // Auto-seed presets if no workflows exist (first run only)
      if (workflows.length === 0) {
        const seeded = await seedDefaultWorkflows();
        this.workflows = seeded.length > 0 ? seeded : workflows;
      } else {
        this.workflows = workflows;
      }
      this.workflowStatus = status;

      // Restore runningWorkflowIds from gateway state (survives page reload)
      const loaded = this.workflows;
      const running = new Set(this.runningWorkflowIds);
      for (const w of loaded) {
        if (typeof w.runningAtMs === "number") running.add(w.id);
      }
      this.runningWorkflowIds = running;
    } catch (err) {
      if (!silent) {
        this.workflowError = err instanceof Error ? err.message : "Không thể tải workflows";
      }
    } finally {
      if (!silent) {
        // Ensure minimum 400ms loading time for visible feedback
        const elapsed = Date.now() - startTime;
        const minDelay = 400;
        if (elapsed < minDelay) {
          await new Promise((r) => setTimeout(r, minDelay - elapsed));
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
      this.workflowShowForm = false;
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
    // If disabling and job is running, cancel it on gateway first then wait for it to stop
    if (!newState && this.runningWorkflowIds.has(workflow.id)) {
      try {
        const { cancelWorkflow } = await import("./workflow-api");
        await cancelWorkflow(workflow.id);
        // Wait for job to finish (gateway sends cron event when done) — max 30s
        await new Promise<void>((resolve) => {
          const maxWait = setTimeout(resolve, 30_000);
          const check = setInterval(() => {
            if (!this.runningWorkflowIds.has(workflow.id)) {
              clearInterval(check);
              clearTimeout(maxWait);
              resolve();
            }
          }, 500);
        });
      } catch {
        /* best effort */
      }
    }
    // Optimistic update - update UI immediately
    this.workflows = this.workflows.map((w) =>
      w.id === workflow.id ? { ...w, enabled: newState } : w,
    );
    try {
      await toggleWorkflow(workflow.id, newState);
      showToast(
        newState ? `Đã kích hoạt "${workflow.name}"` : `Đã tạm dừng "${workflow.name}"`,
        "success",
      );
    } catch (err) {
      // Revert on error
      this.workflows = this.workflows.map((w) =>
        w.id === workflow.id ? { ...w, enabled: !newState } : w,
      );
      const msg = err instanceof Error ? err.message : "Không thể thay đổi trạng thái";
      showToast(msg, "error");
      this.workflowError = msg;
    }
  }

  private async handleWorkflowRun(workflow: Workflow) {
    // Block if already running
    if (this.runningWorkflowIds.has(workflow.id)) {
      showToast(`"${workflow.name}" đang chạy, vui lòng đợi hoàn thành.`, "warning");
      return;
    }
    // Mark as running immediately
    this.runningWorkflowIds = new Set([...this.runningWorkflowIds, workflow.id]);
    try {
      await runWorkflow(workflow.id);
      showToast(`Đang chạy "${workflow.name}"...`, "info");
      // Cron events (started/finished) will update runningWorkflowIds via WS.
      // Fallback: clear after 5min in case WS events are missed.
      setTimeout(() => {
        if (this.runningWorkflowIds.has(workflow.id)) {
          const newSet = new Set(this.runningWorkflowIds);
          newSet.delete(workflow.id);
          this.runningWorkflowIds = newSet;
        }
      }, 300_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể chạy workflow";
      const isTimeout = msg.includes("timeout") || msg.includes("Timeout");
      if (!isTimeout) {
        // Only clear running state for non-timeout errors (e.g. gateway disconnected).
        // Timeout means the job is likely still running — let WS "finished" event handle it.
        this.runningWorkflowIds = new Set(
          [...this.runningWorkflowIds].filter((id) => id !== workflow.id),
        );
        showToast(msg, "error");
        this.workflowError = msg;
      }
    }
  }

  private async handleWorkflowCancel(workflow: Workflow) {
    if (!this.runningWorkflowIds.has(workflow.id)) {
      showToast(`"${workflow.name}" không đang chạy.`, "warning");
      return;
    }
    try {
      const { cancelWorkflow } = await import("./workflow-api");
      await cancelWorkflow(workflow.id);
      showToast(`Đã gửi lệnh hủy "${workflow.name}"`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể hủy workflow";
      showToast(msg, "error");
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
    // If running, cancel on gateway first then wait for it to stop
    if (this.runningWorkflowIds.has(workflow.id)) {
      try {
        const { cancelWorkflow } = await import("./workflow-api");
        await cancelWorkflow(workflow.id);
        await new Promise<void>((resolve) => {
          const maxWait = setTimeout(resolve, 30_000);
          const check = setInterval(() => {
            if (!this.runningWorkflowIds.has(workflow.id)) {
              clearInterval(check);
              clearTimeout(maxWait);
              resolve();
            }
          }, 500);
        });
      } catch {
        /* best effort */
      }
    }
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

    // Load token balance (includes free reset countdown)
    try {
      const bal = await getTokenBalance();
      this.billingFreeResetAt = bal.next_free_reset_at;
      // Sync balances from dedicated endpoint
      if (this.currentUser) {
        this.currentUser = {
          ...this.currentUser,
          token_balance: bal.paid,
          free_token_balance: bal.free,
        };
      }
    } catch {
      /* keep existing values */
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
    showToast("Đã tạo API key", "success");
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
      showToast("Đã xóa API key", "success");
    }
  }

  // Channels handlers
  private async loadChannels() {
    this.channelsLoading = true;
    this.channelsError = null;
    try {
      this.channels = await getChannelsStatus();
    } catch (err) {
      this.channelsError = err instanceof Error ? err.message : "Không thể tải kênh";
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
      const result = await connectChannel(channelId);
      console.log("[channels] connect result:", channelId);

      // Zalo: start QR polling flow
      if (channelId === "zalo" && result.sessionToken) {
        this.zaloQrStatus = "pending";
        this.zaloQrBase64 = null;
        this.startZaloPolling(result.sessionToken);
        return; // Don't clear channelsConnecting yet — QR modal stays open
      }

      await this.loadChannels();
      showToast("Đã kết nối kênh", "success");
    } catch (err) {
      console.error("[channels] connect error:", err);
      this.channelsError = err instanceof Error ? err.message : "Không thể kết nối kênh";
      showToast(err instanceof Error ? err.message : "Không thể kết nối kênh", "error");
    } finally {
      if (this.zaloQrStatus === null) {
        this.channelsConnecting = null;
      }
    }
  }

  private startZaloPolling(sessionToken: string) {
    // Only clear previous timer, don't reset QR state
    if (this.zaloPollingTimer) {
      clearInterval(this.zaloPollingTimer);
      this.zaloPollingTimer = null;
    }
    this.zaloPollingTimer = setInterval(async () => {
      try {
        const status = await getZaloStatus(sessionToken);
        this.zaloQrStatus = status.status;

        if (status.qrBase64) {
          this.zaloQrBase64 = status.qrBase64;
        }

        // Terminal states
        if (status.status === "success") {
          this.stopZaloPolling();
          this.channelsConnecting = null;
          await this.loadChannels();
        } else if (status.status === "error") {
          this.stopZaloPolling();
          this.channelsConnecting = null;
          this.channelsError = status.error || "Kết nối Zalo thất bại";
        }
      } catch {
        this.stopZaloPolling();
        this.channelsConnecting = null;
        this.channelsError = "Mất kết nối khi chờ quét mã QR";
      }
    }, 2000);
  }

  private stopZaloPolling() {
    if (this.zaloPollingTimer) {
      clearInterval(this.zaloPollingTimer);
      this.zaloPollingTimer = null;
    }
    this.zaloQrBase64 = null;
    this.zaloQrStatus = null;
  }

  private async handleChannelDisconnect(channelId: ChannelId) {
    this.channelsConnecting = channelId;
    this.channelsError = null;
    try {
      await disconnectChannel(channelId);
      await this.loadChannels();
      showToast("Đã ngắt kết nối kênh", "success");
    } catch (err) {
      this.channelsError = err instanceof Error ? err.message : "Không thể ngắt kết nối kênh";
      showToast(err instanceof Error ? err.message : "Không thể ngắt kết nối kênh", "error");
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
      this.settingsError = err instanceof Error ? err.message : "Không thể tải hồ sơ";
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
      showToast("Đã cập nhật tên", "success");
    } catch (err) {
      this.settingsError = err instanceof Error ? err.message : "Không thể cập nhật hồ sơ";
      showToast(err instanceof Error ? err.message : "Không thể cập nhật hồ sơ", "error");
    } finally {
      this.settingsSaving = false;
    }
  }

  private async handleChangePassword(currentPassword: string, newPassword: string) {
    this.settingsSaving = true;
    this.settingsError = null;
    this.settingsSuccess = null;
    try {
      await changePassword(currentPassword, newPassword);
      this.settingsShowPasswordForm = false;
      this.settingsSuccess = "Đổi mật khẩu thành công";
      setTimeout(() => (this.settingsSuccess = null), 3000);
      showToast("Đổi mật khẩu thành công", "success");
    } catch (err) {
      this.settingsError = err instanceof Error ? err.message : "Không thể đổi mật khẩu";
      showToast(err instanceof Error ? err.message : "Không thể đổi mật khẩu", "error");
    } finally {
      this.settingsSaving = false;
    }
  }

  // API key handlers
  private async loadApiKeyStatus() {
    this.settingsApiKeyLoading = true;
    try {
      const client = await waitForConnection();
      const res = await client.request<{ config: Record<string, unknown>; hash: string }>(
        "config.get",
        {},
      );
      if (res?.config) {
        const providers = (res.config as any)?.models?.providers?.operis;
        this.settingsApiKeyHasKey = !!(providers?.apiKey && providers.apiKey !== "••••••••");
      }
    } catch {
      // ignore — config may not be available
    } finally {
      this.settingsApiKeyLoading = false;
    }
  }

  private async handleSaveApiKey() {
    const key = this.settingsApiKey.trim();
    if (!key) return;
    this.settingsApiKeySaving = true;
    this.settingsError = null;
    try {
      const client = await waitForConnection();
      // Get current config hash for optimistic concurrency
      const snapshot = await client.request<{ config: Record<string, unknown>; hash: string }>(
        "config.get",
        {},
      );
      const baseHash = snapshot?.hash ?? "";
      // Patch only the apiKey field
      await client.request("config.patch", {
        baseHash,
        raw: JSON.stringify({ models: { providers: { operis: { apiKey: key } } } }),
      });
      this.settingsApiKey = "";
      this.settingsApiKeyHasKey = true;
      this.settingsSuccess = "API key đã được lưu";
      setTimeout(() => (this.settingsSuccess = null), 3000);
      showToast("API key đã được lưu", "success");
    } catch (err) {
      this.settingsError = err instanceof Error ? err.message : "Không thể lưu API key";
      showToast(err instanceof Error ? err.message : "Không thể lưu API key", "error");
    } finally {
      this.settingsApiKeySaving = false;
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

  private handleSelectPanel(
    panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron",
  ) {
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
        agentId: this.agentSelectedId,
        name,
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
        agentId: this.agentSelectedId,
        name,
        content,
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
        name,
        installId,
        timeoutMs: 120000,
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
      const res = await client.request<{ pending?: PendingDevice[]; paired?: PairedDevice[] }>(
        "device.pair.list",
        {},
      );
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
      const res = await client.request<{ config: Record<string, unknown>; hash: string }>(
        "config.get",
        {},
      );
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
      const res = await client.request<import("./agent-types").ExecApprovalsSnapshot>(
        method,
        params,
      );
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
        const days =
          this.analyticsPeriod === "1d"
            ? 1
            : this.analyticsPeriod === "7d"
              ? 7
              : this.analyticsPeriod === "30d"
                ? 30
                : 90;
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

  // ── Sessions handlers ─────────────────────────────────────────────────

  private async loadSessionsList() {
    this.sessionsLoading = true;
    this.sessionsError = null;
    try {
      const gw = await waitForConnection(5000);
      const result = await gw.request<any>("sessions.list", {
        activeMinutes: this.sessionsActiveMinutes ? Number(this.sessionsActiveMinutes) : 525600,
        limit: Number(this.sessionsLimit) || 120,
        includeGlobal: this.sessionsIncludeGlobal,
        includeUnknown: this.sessionsIncludeUnknown,
      });
      this.sessionsResult = result;
    } catch (err) {
      this.sessionsError = err instanceof Error ? err.message : String(err);
    } finally {
      this.sessionsLoading = false;
    }
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
    try {
      const gw = await waitForConnection(5000);
      await gw.request("sessions.patch", { key, ...patch });
      this.loadSessionsList();
    } catch (err) {
      console.error("[sessions] patch failed:", err);
      showToast("Failed to patch session", "error");
    }
  }

  private async handleSessionsDelete(key: string) {
    const confirmed = await showConfirm({
      title: `Delete session "${key}"?`,
      message: "This action cannot be undone.",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      const gw = await waitForConnection(5000);
      await gw.request("sessions.delete", { key });
      this.loadSessionsList();
    } catch (err) {
      console.error("[sessions] delete failed:", err);
      showToast("Failed to delete session", "error");
    }
  }

  // ── Report handlers ──────────────────────────────────────────────────

  private async loadReports() {
    this.reportLoading = true;
    this.reportError = null;
    try {
      const isAdmin = this.currentUser?.role === "admin";
      const result = isAdmin ? await getAllReports() : await getMyReports();
      this.reports = result.reports;
    } catch (err) {
      this.reportError = err instanceof Error ? err.message : "Không thể tải góp ý";
    } finally {
      this.reportLoading = false;
    }
  }

  private async handleReportSubmit() {
    const { type, subject, content } = this.reportForm;
    if (!subject.trim() || !content.trim()) return;

    this.reportSubmitting = true;
    try {
      await createReport(type, subject, content);
      showToast("Cảm ơn bạn đã đóng góp ý kiến!", "success");
      this.reportForm = { type: "bug", subject: "", content: "" };
      await this.loadReports();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gửi góp ý thất bại", "error");
    } finally {
      this.reportSubmitting = false;
    }
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
      sessions: "Sessions",
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
      case "chat":
        return renderChat({
          messages: this.chatMessages,
          draft: this.chatDraft,
          sending: this.chatSending || Boolean(this.chatRunId),
          loading: this.chatInitializing,
          isLoggedIn: this.settings.isLoggedIn,
          username: this.settings.username ?? undefined,
          botName: "Operis",
          streamingText: this.chatStreamingText,
          toolCalls: this.chatToolCalls,
          pendingImages: this.chatPendingImages,
          onDraftChange: (value) => (this.chatDraft = value),
          onSend: () => this.handleSendMessage(),
          onStop: () => this.handleStopChat(),
          onLoginClick: () => this.setTab("login"),
          onImageSelect: (files) => this.handleImageSelect(files),
          onImageRemove: (index) => this.handleImageRemove(index),
          // Sidebar props
          conversations: this.chatConversations,
          conversationsLoading: this.chatConversationsLoading,
          currentConversationId: this.chatConversationId,
          sidebarCollapsed: this.settings.chatSidebarCollapsed,
          onToggleSidebar: () => this.toggleChatSidebar(),
          onNewConversation: () => this.handleNewConversation(),
          onSwitchConversation: (id: string) => this.handleSwitchConversation(id),
          onDeleteConversation: (id: string) => this.handleDeleteConversation(id),
          onRefreshChat: () => this.handleRefreshChat(),
          compactionActive: this.chatCompactionActive,
          queue: this.chatQueue,
          onQueueRemove: (id: string) => this.removeQueuedMessage(id),
          sessionKey: this.normalizeSessionKey(this.chatConversationId || "main"),
          gatewaySessions: this.gatewaySessions,
          onSessionChange: (key: string) => this.handleSessionChange(key),
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
          onDelete: (w) => this.handleWorkflowDelete(w),
          onToggleDetails: (id: string) => {
            this.workflowExpandedId = this.workflowExpandedId === id ? null : id;
          },
          expandedWorkflowId: this.workflowExpandedId,
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
          showForm: this.workflowShowForm,
          onToggleForm: () => {
            this.workflowShowForm = !this.workflowShowForm;
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
            this.chatConversationId = key === "main" ? null : key;
            this.chatMessages = [];
            this.chatStreamingText = "";
            this.chatToolCalls = [];
            this.persistSessionKey(key);
            this.setTab("chat");
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
            this.tab !== "login"
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

          ${this.renderContent()}
        </main>

      </div>
    `;
  }
}
