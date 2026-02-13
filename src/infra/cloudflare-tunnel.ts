/**
 * Cloudflare Tunnel process manager (reusable across platforms).
 * Spawns `cloudflared tunnel run --token <token>` and monitors status.
 * Follows ssh-tunnel.ts spawn/stop pattern.
 */
import { spawn, type ChildProcess, execFile } from "node:child_process";

export type CloudflareTunnelStatus = "connecting" | "connected" | "disconnected" | "error";

export interface CloudflareTunnel {
  readonly status: CloudflareTunnelStatus;
  readonly pid: number | null;
  stop: () => Promise<void>;
  onStatus: (cb: (status: CloudflareTunnelStatus, detail?: string) => void) => () => void;
}

export interface CloudflareTunnelOptions {
  /** Absolute path to cloudflared binary */
  binaryPath: string;
  /** Tunnel token (JWT from Cloudflare dashboard) */
  token: string;
  /** Optional log callback for cloudflared output */
  onLog?: (line: string) => void;
}

/** Regex matching cloudflared connection success messages */
const CONNECTED_RE = /Registered tunnel connection|Connection .+ registered/i;

/**
 * Start a Cloudflare Tunnel process.
 * Returns control handle with status monitoring and graceful stop.
 */
export function startCloudflareTunnel(opts: CloudflareTunnelOptions): CloudflareTunnel {
  // Validate token: must be non-empty, no whitespace (prevents arg injection)
  if (!opts.token || /\s/.test(opts.token)) {
    throw new Error("Invalid cloudflare tunnel token");
  }

  let currentStatus: CloudflareTunnelStatus = "connecting";
  const listeners: ((status: CloudflareTunnelStatus, detail?: string) => void)[] = [];

  const emit = (status: CloudflareTunnelStatus, detail?: string): void => {
    currentStatus = status;
    for (const l of listeners) l(status, detail);
  };

  const child: ChildProcess = spawn(
    opts.binaryPath,
    ["tunnel", "run", "--token", opts.token],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  let resolved = false;

  // Monitor stdout/stderr for connection status
  const handleOutput = (chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    opts.onLog?.(text.trimEnd());
    if (CONNECTED_RE.test(text)) {
      emit("connected");
    }
  };

  child.stdout?.on("data", handleOutput);
  child.stderr?.on("data", handleOutput);

  child.on("error", (err) => {
    if (!resolved) {
      resolved = true;
      emit("error", err.message);
    }
  });

  child.on("exit", (code) => {
    if (!resolved) {
      resolved = true;
    }
    if (currentStatus !== "disconnected") {
      emit("disconnected", code !== null ? `exit code ${code}` : undefined);
    }
  });

  // Graceful stop: SIGTERM -> 5s -> force kill
  const stop = async (): Promise<void> => {
    if (child.killed) return;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        forceKill(child);
        resolve();
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(timeout);
        emit("disconnected");
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        forceKill(child);
        resolve();
      }
    });
  };

  return {
    get status() {
      return currentStatus;
    },
    pid: child.pid ?? null,
    stop,
    onStatus(cb) {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
  };
}

/** Force kill process, using taskkill on Windows for process tree cleanup */
function forceKill(child: ChildProcess): void {
  try {
    if (process.platform === "win32" && child.pid) {
      execFile("taskkill", ["/T", "/F", "/PID", String(child.pid)], () => {});
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // Process already gone
  }
}
