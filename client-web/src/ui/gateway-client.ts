/**
 * Gateway WebSocket Client for Client-Web
 * Full version with device authentication (like admin UI)
 */
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth";

function generateUUID(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Build device auth payload for signing
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

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayClientOptions = {
  url: string;
  token?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onConnected?: () => void;
};

const CLIENT_ID = "openclaw-control-ui";
const CLIENT_MODE = "ui";
const ROLE = "operator";
const SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  private _connected = false;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this._connected && this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) return;
    this.ws = new WebSocket(this.opts.url);
    this.ws.onopen = () => this.queueConnect();
    this.ws.onmessage = (ev) => this.handleMessage(String(ev.data ?? ""));
    this.ws.onclose = (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this._connected = false;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      // ignored; close handler will fire
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let canFallbackToShared = false;
    let authToken = this.opts.token;

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      const storedToken = loadDeviceAuthToken({
        deviceId: deviceIdentity.deviceId,
        role: ROLE,
      })?.token;
      authToken = storedToken ?? this.opts.token;
      canFallbackToShared = Boolean(storedToken && this.opts.token);
    }

    const auth = authToken ? { token: authToken } : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (isSecureContext && deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: CLIENT_ID,
        clientMode: CLIENT_MODE,
        role: ROLE,
        scopes: SCOPES,
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
        id: CLIENT_ID,
        version: "1.0.0",
        platform: navigator.platform ?? "web",
        mode: CLIENT_MODE,
      },
      role: ROLE,
      scopes: SCOPES,
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
            role: hello.auth.role ?? ROLE,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }
        this.backoffMs = 800;
        this._connected = true;
        this.opts.onHello?.(hello);
        this.opts.onConnected?.();
      })
      .catch(() => {
        if (canFallbackToShared && deviceIdentity) {
          clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: ROLE });
        }
        this.ws?.close(4008, "connect failed");
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
      if (!pending) return;
      this.pending.delete(res.id);
      if (res.ok) pending.resolve(res.payload);
      else pending.reject(new Error(res.error?.message ?? "request failed"));
      return;
    }
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 10000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          window.clearTimeout(timer);
          resolve(v as T);
        },
        reject: (err) => {
          window.clearTimeout(timer);
          reject(err);
        },
      });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer);
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }
}

// Cron event type from gateway
export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished";
  runAtMs?: number;
  durationMs?: number;
  status?: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  nextRunAtMs?: number;
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
  state: "delta" | "final" | "error";
  message?: {
    role: "assistant";
    content: Array<{ type: string; text?: string }>;
    timestamp?: number;
    usage?: ChatTokenUsage;
  };
  usage?: ChatTokenUsage;
  errorMessage?: string;
};

// Event listeners for cron events
type CronEventListener = (event: CronEvent) => void;
const cronEventListeners = new Set<CronEventListener>();

export function subscribeToCronEvents(listener: CronEventListener): () => void {
  cronEventListeners.add(listener);
  // Ensure gateway client is started to receive events
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

// Event listeners for chat streaming events
type ChatStreamListener = (event: ChatStreamEvent) => void;
const chatStreamListeners = new Set<ChatStreamListener>();

export function subscribeToChatStream(listener: ChatStreamListener): () => void {
  chatStreamListeners.add(listener);
  // Ensure gateway client is started to receive events
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

// Singleton instance
let client: GatewayClient | null = null;
let connectionPromise: Promise<void> | null = null;

// Get token from URL query param or env
function getGatewayToken(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? import.meta.env.VITE_GATEWAY_TOKEN ?? undefined;
}

// Get WebSocket URL - use VITE_GATEWAY_WS or derive from current location
function getGatewayWsUrl(): string {
  // If env var is set, use it
  if (import.meta.env.VITE_GATEWAY_WS) {
    return import.meta.env.VITE_GATEWAY_WS;
  }
  // If running on gateway port directly, use current host
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  // Check if we're running on dev server (port 5173) - connect to gateway instead
  if (host.includes(":5173")) {
    return "ws://127.0.0.1:18789/";
  }
  return `${protocol}//${host}/`;
}

export function getGatewayClient(): GatewayClient {
  if (!client) {
    const wsUrl = getGatewayWsUrl();

    client = new GatewayClient({
      url: wsUrl,
      token: getGatewayToken(),
      onConnected: () => {
        console.log("[gateway] connected");
      },
      onClose: ({ code, reason }) => {
        console.log(`[gateway] closed: ${code} ${reason}`);
      },
      onEvent: (evt) => {
        // Handle cron events
        if (evt.event === "cron" && evt.payload) {
          notifyCronListeners(evt.payload as CronEvent);
        }
        // Handle chat streaming events
        if (evt.event === "chat" && evt.payload) {
          notifyChatStreamListeners(evt.payload as ChatStreamEvent);
        }
      },
    });
    client.start();
  }
  return client;
}

export async function waitForConnection(timeoutMs = 5000): Promise<GatewayClient> {
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
    });
  }

  await connectionPromise;
  connectionPromise = null;
  return c;
}
