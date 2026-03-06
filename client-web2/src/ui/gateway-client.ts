import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";

function generateUUID(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Build device auth payload for signing (inlined from src/gateway/device-auth)
function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

// ---------------------------------------------------------------------------
// Types — copied 1:1 from openclaw2 ui/src/ui/gateway.ts
// ---------------------------------------------------------------------------

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(error: GatewayErrorInfo) {
    super(error.message);
    this.name = "GatewayRequestError";
    this.gatewayCode = error.code;
    this.details = error.details;
  }
}

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: {
    version?: string;
    connId?: string;
  };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: string;
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

// ---------------------------------------------------------------------------
// GatewayBrowserClient — copied 1:1 from openclaw2 ui/src/ui/gateway.ts
// ---------------------------------------------------------------------------

// 4008 = application-defined code (browser rejects 1008 "Policy Violation")
const CONNECT_FAILED_CLOSE_CODE = 4008;

const CLIENT_NAME = "openclaw-control-ui";
const CLIENT_MODE = "webchat";

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  private pendingConnectError: GatewayErrorInfo | undefined;

  constructor(private opts: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.pendingConnectError = undefined;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) {
      return;
    }
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason, error: connectError });
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => {
      // ignored; close handler will fire
    });
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    // Over plain HTTP, we skip device identity and fall back to token-only auth.
    // Gateways may reject this unless gateway.controlUi.allowInsecureAuth is enabled.
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let authToken = this.opts.token;

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      // Only use stored device token when no URL token is available
      if (!authToken) {
        const storedToken = loadDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role,
        })?.token;
        authToken = storedToken;
      }
    }
    const auth =
      authToken || this.opts.password
        ? {
            token: authToken,
            password: this.opts.password,
          }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string;
        }
      | undefined;

    if (isSecureContext && deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? "";
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: this.opts.clientName ?? CLIENT_NAME,
        clientMode: this.opts.mode ?? CLIENT_MODE,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.opts.clientName ?? CLIENT_NAME,
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? navigator.platform ?? "web",
        mode: this.opts.mode ?? CLIENT_MODE,
        instanceId: this.opts.instanceId,
      },
      role,
      scopes,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    void this.request<GatewayHelloOk>("connect", params)
      .then((hello) => {
        if (hello?.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }
        this.backoffMs = 800;
        this.opts.onHello?.(hello);
      })
      .catch((err: unknown) => {
        if (err instanceof GatewayRequestError) {
          this.pendingConnectError = {
            code: err.gatewayCode,
            message: err.message,
            details: err.details,
          };
        } else {
          this.pendingConnectError = undefined;
        }
        // Always clear stale device token on connect failure
        if (deviceIdentity) {
          clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role });
        }
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      try {
        this.opts.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(
          new GatewayRequestError({
            code: res.error?.code ?? "UNAVAILABLE",
            message: res.error?.message ?? "request failed",
            details: res.error?.details,
          }),
        );
      }
      return;
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }
}

// Keep GatewayClient as alias for backward compatibility with rest of client-web2
export { GatewayBrowserClient as GatewayClient };

// ---------------------------------------------------------------------------
// Event types (client-web2 specific pub/sub infrastructure)
// ---------------------------------------------------------------------------

// Agent tool event from gateway (stream: "tool")
export type ToolEvent = {
  runId: string;
  seq: number;
  stream: "tool";
  ts: number;
  sessionKey?: string;
  data: {
    phase: "start" | "update" | "result";
    toolCallId: string;
    name?: string;
    args?: unknown;
    result?: unknown;
    partialResult?: unknown;
    isError?: boolean;
  };
};

export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

export type CronProgressStep = "initializing" | "prompting" | "executing" | "delivering";

/** Live activity item from agent execution (tool call or assistant text). */
export type CronActivity = {
  kind: "tool" | "thinking";
  id: string;
  name?: string;
  phase?: "start" | "result";
  detail?: string;
  isError?: boolean;
};

// Cron event type from gateway
export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished" | "progress" | "activity";
  runAtMs?: number;
  durationMs?: number;
  status?: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  nextRunAtMs?: number;
  /** Progress milestone step (only for action: "progress"). */
  step?: CronProgressStep;
  /** Human-readable detail for the progress step. */
  stepDetail?: string;
  /** Live activity from agent run (only for action: "activity"). */
  activity?: CronActivity;
  usage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
  model?: string;
};

// Token usage from gateway agent runs
export type ChatTokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  // OpenAI-compatible fields (same as HTTP server)
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

// Chat streaming event type from gateway
export type ChatStreamEvent = {
  runId: string;
  sessionKey?: string;
  seq: number;
  state: "delta" | "final" | "error" | "aborted";
  message?: {
    role: "assistant";
    content: Array<{ type: string; text?: string }>;
    timestamp?: number;
    usage?: ChatTokenUsage;
  };
  usage?: ChatTokenUsage;
  errorMessage?: string;
};

// ---------------------------------------------------------------------------
// Pub/sub event listeners
// ---------------------------------------------------------------------------

// Event listeners for cron events
type CronEventListener = (event: CronEvent) => void;
const cronEventListeners = new Set<CronEventListener>();

export function subscribeToCronEvents(listener: CronEventListener): () => void {
  cronEventListeners.add(listener);
  getGatewayClient();
  return () => cronEventListeners.delete(listener);
}

function notifyCronListeners(event: CronEvent) {
  for (const listener of cronEventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[gateway] cron event listener error:", err);
    }
  }
}

// Agent lifecycle event from gateway (stream: "lifecycle")
export type LifecycleEvent = {
  runId: string;
  stream: "lifecycle";
  sessionKey?: string;
  data: {
    phase: "start" | "end" | "error";
  };
};

type LifecycleEventListener = (event: LifecycleEvent) => void;
const lifecycleEventListeners = new Set<LifecycleEventListener>();

export function subscribeToLifecycleEvents(listener: LifecycleEventListener): () => void {
  lifecycleEventListeners.add(listener);
  getGatewayClient();
  return () => lifecycleEventListeners.delete(listener);
}

function notifyLifecycleListeners(event: LifecycleEvent) {
  for (const listener of lifecycleEventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[gateway] lifecycle event listener error:", err);
    }
  }
}

// Event listeners for tool events
type ToolEventListener = (event: ToolEvent) => void;
const toolEventListeners = new Set<ToolEventListener>();

export function subscribeToToolEvents(listener: ToolEventListener): () => void {
  toolEventListeners.add(listener);
  getGatewayClient();
  return () => toolEventListeners.delete(listener);
}

function notifyToolListeners(event: ToolEvent) {
  for (const listener of toolEventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[gateway] tool event listener error:", err);
    }
  }
}

// Event listeners for chat streaming events
type ChatStreamListener = (event: ChatStreamEvent) => void;
const chatStreamListeners = new Set<ChatStreamListener>();

export function subscribeToChatStream(listener: ChatStreamListener): () => void {
  chatStreamListeners.add(listener);
  getGatewayClient();
  return () => chatStreamListeners.delete(listener);
}

function notifyChatStreamListeners(event: ChatStreamEvent) {
  for (const listener of chatStreamListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[gateway] chat stream listener error:", err);
    }
  }
}

// Compaction event from gateway (agent stream: "compaction")
export type CompactionEvent = {
  phase: "start" | "end";
};

type CompactionEventListener = (event: CompactionEvent) => void;
const compactionEventListeners = new Set<CompactionEventListener>();

export function subscribeToCompactionEvents(listener: CompactionEventListener): () => void {
  compactionEventListeners.add(listener);
  getGatewayClient();
  return () => compactionEventListeners.delete(listener);
}

function notifyCompactionListeners(event: CompactionEvent) {
  for (const listener of compactionEventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[gateway] compaction event listener error:", err);
    }
  }
}

// Reconnect listeners — fired when gateway WS reconnects after a drop
type ReconnectListener = () => void;
const reconnectListeners = new Set<ReconnectListener>();

export function onGatewayReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Singleton instance + helpers
// ---------------------------------------------------------------------------

let client: GatewayBrowserClient | null = null;
let connectionPromise: Promise<void> | null = null;

function getGatewayToken(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? undefined;
}

function getGatewayWsUrl(): string {
  if (import.meta.env.VITE_GATEWAY_WS) {
    return import.meta.env.VITE_GATEWAY_WS;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  if (!host || window.location.protocol === "file:" || host.includes(":5173")) {
    return "ws://127.0.0.1:18789/";
  }
  return `${protocol}//${host}/`;
}

export function getGatewayClient(): GatewayBrowserClient {
  if (!client) {
    const wsUrl = getGatewayWsUrl();

    client = new GatewayBrowserClient({
      url: wsUrl,
      token: getGatewayToken(),
      mode: CLIENT_MODE,
      clientName: CLIENT_NAME,
      onHello: (hello) => {
        console.log("[gateway] connected", hello.server?.version ?? "");
        // Notify reconnect listeners on every connect (including first)
        // so sessions/chat data load as soon as WS is ready
        for (const listener of reconnectListeners) {
          try {
            listener();
          } catch (err) {
            console.error("[gateway] reconnect listener error:", err);
          }
        }
      },
      onClose: ({ code, reason }) => {
        console.log(`[gateway] closed: ${code} ${reason}`);
      },
      onGap: ({ expected, received }) => {
        console.warn(`[gateway] seq gap: expected ${expected}, got ${received}`);
        // Trigger reconnect listeners so chat reloads history
        for (const listener of reconnectListeners) {
          try {
            listener();
          } catch {}
        }
      },
      onEvent: (evt) => {
        // Handle cron events
        if (evt.event === "cron" && evt.payload) {
          notifyCronListeners(evt.payload as CronEvent);
        }
        // Handle chat streaming events (validate required fields)
        if (evt.event === "chat" && evt.payload) {
          const cp = evt.payload as Record<string, unknown>;
          if (typeof cp.runId === "string" && typeof cp.state === "string") {
            notifyChatStreamListeners(evt.payload as ChatStreamEvent);
          }
        }
        // Handle agent events (tool + lifecycle + compaction streams)
        if (evt.event === "agent" && evt.payload) {
          const p = evt.payload as {
            stream?: string;
            data?: Record<string, unknown>;
            runId?: string;
          };
          if (p.stream === "tool" && typeof p.runId === "string") {
            notifyToolListeners(evt.payload as ToolEvent);
          } else if (p.stream === "lifecycle") {
            notifyLifecycleListeners(evt.payload as LifecycleEvent);
          } else if (p.stream === "compaction" && p.data) {
            const phase = typeof p.data.phase === "string" ? p.data.phase : "";
            if (phase === "start" || phase === "end") {
              notifyCompactionListeners({ phase });
            }
          }
        }
      },
    });
    client.start();
  }
  return client;
}

/** Debug: force WS disconnect to test reconnect behavior. Call from console: window.__forceDisconnect() */
export function forceDisconnectForDebug() {
  if (client) {
    console.warn("[gateway] forcing WS disconnect for debug");
    (client as unknown as { ws: WebSocket | null }).ws?.close(4000, "debug disconnect");
  }
}
(window as unknown as Record<string, unknown>).__forceDisconnect = forceDisconnectForDebug;

export function stopGatewayClient() {
  if (client) {
    client.stop();
    client = null;
  }
  connectionPromise = null;
}

export async function waitForConnection(timeoutMs = 5000): Promise<GatewayBrowserClient> {
  const c = getGatewayClient();
  if (c.connected) return c;

  if (!connectionPromise) {
    connectionPromise = new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (c.connected) {
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error("Gateway connection timeout"));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    }).finally(() => {
      connectionPromise = null;
    });
  }

  await connectionPromise;
  return c;
}
