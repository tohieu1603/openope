import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { Zalo, ThreadType } from "zca-js";
import type { ZcaJsFriend, ZcaJsGroup, ZcaJsMessage, ZcaJsUserInfo } from "./types.js";

// Singleton map: credentialsPath -> active API instance
const apiInstances = new Map<string, ZcaJsApiInstance>();

// The zca-js API type inferred from loginQR return
type ZcaJsApi = Awaited<ReturnType<Zalo["loginQR"]>>;

export type ZcaJsApiInstance = {
  api: ZcaJsApi;
  credentialsPath: string;
};

// All credential fields returned by zca-js GotLoginInfo (imei, cookie, userAgent, zpw_enk, etc.)
type Credentials = Record<string, unknown>;

function resolveCredentialsDir(): string {
  return join(homedir(), ".operis", "credentials", "zalozcajs");
}

/**
 * Resolve the full path for storing zca-js credentials
 */
export function resolveCredentialsPath(accountId: string): string {
  if (accountId && isAbsolute(accountId)) {
    return accountId;
  }
  return join(resolveCredentialsDir(), `${accountId || "default"}.json`);
}

async function saveCredentials(path: string, credentials: Credentials): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(path, JSON.stringify(credentials, null, 2), "utf-8");
}

async function loadCredentials(path: string): Promise<Credentials | null> {
  try {
    if (!existsSync(path)) return null;
    const raw = await fs.readFile(path, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function hasCredentials(credentialsPath: string): Promise<boolean> {
  const resolved = isAbsolute(credentialsPath)
    ? credentialsPath
    : resolveCredentialsPath(credentialsPath);
  const creds = await loadCredentials(resolved);
  return creds !== null;
}

/**
 * Login with saved credentials (cookie-based)
 */
export async function loginWithCredentials(
  credentialsPath: string,
): Promise<ZcaJsApiInstance | null> {
  const path = isAbsolute(credentialsPath)
    ? credentialsPath
    : resolveCredentialsPath(credentialsPath);

  const existing = apiInstances.get(path);
  if (existing) return existing;

  const creds = await loadCredentials(path);
  if (!creds) return null;

  try {
    const zalo = new Zalo();
    const api = await zalo.login(creds as Parameters<Zalo["login"]>[0]);
    const instance: ZcaJsApiInstance = { api, credentialsPath: path };
    apiInstances.set(path, instance);
    return instance;
  } catch {
    return null;
  }
}

/**
 * Login via QR code.
 * When callback is used, zca-js does NOT auto-save QR — we must call actions.saveToFile().
 * Callback also captures credentials from GotLoginInfo event.
 */
export async function loginWithQR(accountId: string): Promise<ZcaJsApiInstance> {
  const path = resolveCredentialsPath(accountId);
  const zalo = new Zalo({ logging: true });
  let capturedCreds: Credentials | null = null;

  const api = await zalo.loginQR({}, (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const ev = event as {
      type?: number;
      data?: Record<string, unknown>;
      actions?: Record<string, unknown>;
    };

    // QRCodeGenerated event: save QR to file and auto-open
    if (ev.actions && typeof (ev.actions as Record<string, unknown>).saveToFile === "function") {
      const saveToFile = (ev.actions as { saveToFile: (path?: string) => Promise<void> })
        .saveToFile;
      const qrFile = join(process.cwd(), "qr.png");
      saveToFile(qrFile)
        .then(() => {
          try {
            execSync(`open "${qrFile}"`);
          } catch {
            /* ignore non-macOS */
          }
        })
        .catch(() => {
          /* ignore save errors */
        });
    }

    // GotLoginInfo event: capture ALL credential fields (imei, cookie, userAgent, zpw_enk, etc.)
    if (ev.data && typeof ev.data === "object") {
      const data = ev.data;
      if (data.imei && data.cookie && data.userAgent) {
        capturedCreds = { ...data };
      }
    }
  });

  if (capturedCreds) {
    await saveCredentials(path, capturedCreds);
  }

  const instance: ZcaJsApiInstance = { api, credentialsPath: path };
  apiInstances.set(path, instance);
  return instance;
}

/**
 * Gateway-friendly QR login: splits login into start (QR) + wait (completion).
 * Returns a qrPromise that resolves with the base64 QR data URL,
 * and a loginPromise that resolves when login completes.
 */
export function loginWithQRGateway(accountId: string): {
  qrPromise: Promise<string | null>;
  loginPromise: Promise<ZcaJsApiInstance>;
} {
  const path = resolveCredentialsPath(accountId);
  const zalo = new Zalo({ logging: true });
  let capturedCreds: Credentials | null = null;

  let resolveQr: (value: string | null) => void;
  const qrPromise = new Promise<string | null>((resolve) => {
    resolveQr = resolve;
  });

  let qrResolved = false;

  const loginPromise = zalo
    .loginQR({}, async (event: unknown) => {
      if (!event || typeof event !== "object") return;
      const ev = event as {
        type?: number;
        data?: Record<string, unknown>;
        actions?: Record<string, unknown>;
      };

      // QRCodeGenerated: save to temp file, read as base64
      if (ev.actions && typeof (ev.actions as Record<string, unknown>).saveToFile === "function") {
        const saveToFile = (ev.actions as { saveToFile: (path?: string) => Promise<void> })
          .saveToFile;
        const qrFile = join(tmpdir(), `zalozcajs-qr-${Date.now()}.png`);
        try {
          await saveToFile(qrFile);
          const buffer = await fs.readFile(qrFile);
          const base64 = buffer.toString("base64");
          if (!qrResolved) {
            qrResolved = true;
            resolveQr(`data:image/png;base64,${base64}`);
          }
          // Clean up temp file
          fs.unlink(qrFile).catch(() => {});
        } catch {
          if (!qrResolved) {
            qrResolved = true;
            resolveQr(null);
          }
        }
      }

      // GotLoginInfo: capture credentials
      if (ev.data && typeof ev.data === "object") {
        const data = ev.data;
        if (data.imei && data.cookie && data.userAgent) {
          capturedCreds = { ...data };
        }
      }
    })
    .then(async (api) => {
      if (capturedCreds) {
        await saveCredentials(path, capturedCreds);
      }
      // Resolve QR if it never fired
      if (!qrResolved) {
        qrResolved = true;
        resolveQr(null);
      }
      const instance: ZcaJsApiInstance = { api, credentialsPath: path };
      apiInstances.set(path, instance);
      return instance;
    });

  return { qrPromise, loginPromise };
}

export function disconnectInstance(credentialsPath: string): void {
  const path = isAbsolute(credentialsPath)
    ? credentialsPath
    : resolveCredentialsPath(credentialsPath);
  const instance = apiInstances.get(path);
  if (instance) {
    try {
      instance.api.listener.stop();
    } catch {
      /* ignore */
    }
    apiInstances.delete(path);
  }
}

export async function getApiInstance(credentialsPath: string): Promise<ZcaJsApiInstance | null> {
  const path = isAbsolute(credentialsPath)
    ? credentialsPath
    : resolveCredentialsPath(credentialsPath);
  const existing = apiInstances.get(path);
  if (existing) {
    // Credentials file removed externally (e.g. operis-api disconnect) → tear down cached instance
    if (!existsSync(path)) {
      disconnectInstance(path);
      return null;
    }
    return existing;
  }
  return loginWithCredentials(path);
}

export async function sendMessage(
  instance: ZcaJsApiInstance,
  threadId: string,
  text: string,
  isGroup: boolean,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const type = isGroup ? ThreadType.Group : ThreadType.User;
    const result = await instance.api.sendMessage({ msg: text }, threadId, type);
    const raw = (result as unknown as { message?: { msgId?: unknown } })?.message?.msgId;
    const msgId = raw != null ? String(raw) : undefined;
    return { ok: true, messageId: msgId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getSelfInfo(instance: ZcaJsApiInstance): Promise<ZcaJsUserInfo | null> {
  try {
    // Access internal context to get own UID
    const apiAny = instance.api as unknown as Record<string, unknown>;
    const ctx = apiAny.context as Record<string, unknown> | undefined;
    const uid = ctx?.uid as string | undefined;
    if (!uid) return null;

    const info = await instance.api.getUserInfo(uid);
    const infoAny = info as Record<string, unknown>;
    const profiles = (infoAny?.changed_profiles ?? {}) as Record<string, Record<string, unknown>>;
    const profile = profiles[uid];
    if (!profile) return { userId: uid, displayName: uid };

    return {
      userId: uid,
      displayName: String(profile.displayName ?? uid),
      avatar: profile.avatar ? String(profile.avatar) : undefined,
    };
  } catch {
    return null;
  }
}

export async function getAllFriends(instance: ZcaJsApiInstance): Promise<ZcaJsFriend[]> {
  try {
    const friends = await instance.api.getAllFriends();
    if (!Array.isArray(friends)) return [];
    return friends.map((f: Record<string, unknown>) => ({
      userId: String(f.userId ?? f.uid ?? ""),
      displayName: String(f.displayName ?? f.zaloName ?? f.name ?? ""),
      avatar: f.avatar ? String(f.avatar) : undefined,
      zaloName: f.zaloName ? String(f.zaloName) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function getAllGroups(instance: ZcaJsApiInstance): Promise<ZcaJsGroup[]> {
  try {
    const result = await instance.api.getAllGroups();
    const resultAny = result as Record<string, unknown>;
    const gridVerMap = (resultAny?.gridVerMap ?? {}) as Record<string, string>;
    return Object.keys(gridVerMap).map((groupId) => ({
      groupId,
      name: groupId, // Group names need separate getGroupInfo calls
    }));
  } catch {
    return [];
  }
}

/**
 * Start listening for messages via zca-js WebSocket listener
 */
export function startListener(
  instance: ZcaJsApiInstance,
  onMessage: (msg: ZcaJsMessage) => void,
  onError?: (err: Error) => void,
): { stop: () => void } {
  // zca-js Listener extends EventEmitter; cast to access .on()
  const listener = instance.api.listener as unknown as {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    start: () => void;
    stop: () => void;
  };

  listener.on("message", (message: unknown) => {
    try {
      const msg = message as {
        type: number;
        threadId: string;
        isSelf: boolean;
        data: Record<string, unknown>;
      };
      const data = msg.data;

      // Extract text content and image URLs
      let content = "";
      let imageUrls: string[] | undefined;

      if (typeof data.content === "string") {
        content = data.content;
      } else if (data.content && typeof data.content === "object") {
        // Attachment message (image, file, link, etc.)
        const attachment = data.content as Record<string, unknown>;
        // href = full image URL, thumb = thumbnail URL
        const href = attachment.href ? String(attachment.href) : undefined;
        const thumb = attachment.thumb ? String(attachment.thumb) : undefined;
        const title = attachment.title ? String(attachment.title) : undefined;
        const description = attachment.description ? String(attachment.description) : undefined;

        if (href) {
          imageUrls = [href];
        } else if (thumb) {
          imageUrls = [thumb];
        }
        // Use title/description as text content for the message
        content = [title, description].filter(Boolean).join("\n").trim();
      }

      // Skip messages with no text and no images
      if (!content.trim() && !imageUrls?.length) return;

      onMessage({
        threadId: msg.threadId,
        msgId: String(data.msgId ?? data.cliMsgId ?? ""),
        content: content || (imageUrls?.length ? "<image>" : ""),
        timestamp: Number(data.ts ?? Date.now()),
        isGroup: msg.type === ThreadType.Group,
        isSelf: msg.isSelf,
        senderName: data.dName ? String(data.dName) : undefined,
        senderId: data.uidFrom ? String(data.uidFrom) : undefined,
        groupName: undefined,
        imageUrls,
      });
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  });

  listener.on("error", (err: unknown) => {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  listener.start();

  return {
    stop: () => {
      try {
        listener.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

export { ThreadType };
