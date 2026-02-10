/**
 * Cloudflare Tunnel manager for Electron desktop app.
 * Handles token encryption via safeStorage (Windows DPAPI),
 * cloudflared binary resolution, and tunnel lifecycle.
 */
import { spawn, type ChildProcess, execFile } from "node:child_process";
import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { type TunnelStatus } from "./types";

type StatusListener = (status: TunnelStatus, detail?: string) => void;

const CF_BINARY_NAME = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
const CONNECTED_RE = /Registered tunnel connection|Connection .+ registered/i;

export class TunnelManager {
  private child: ChildProcess | null = null;
  private status: TunnelStatus = "disconnected";
  private listeners: StatusListener[] = [];

  get currentStatus(): TunnelStatus {
    return this.status;
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatus(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(status: TunnelStatus, detail?: string): void {
    this.status = status;
    for (const l of this.listeners) l(status, detail);
  }

  /** Resolve encrypted token file path */
  private get tokenFilePath(): string {
    return path.join(app.getPath("userData"), "cf-token.enc");
  }

  /** Save tunnel token encrypted via safeStorage (Windows DPAPI) */
  saveToken(token: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encryption not available on this system");
    }
    const encrypted = safeStorage.encryptString(token);
    const dir = path.dirname(this.tokenFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.tokenFilePath, encrypted);
  }

  /** Read and decrypt stored tunnel token. Returns null if not configured. */
  readToken(): string | null {
    if (!fs.existsSync(this.tokenFilePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const buf = fs.readFileSync(this.tokenFilePath);
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }

  /** Check if a tunnel token has been configured */
  hasToken(): boolean {
    return fs.existsSync(this.tokenFilePath);
  }

  /**
   * Resolve cloudflared binary path.
   * Checks: 1) bundled in resources, 2) downloaded to userData
   */
  resolveBinaryPath(): string | null {
    // Check bundled (extraResources in packaged app, resources/ in dev)
    const bundled = app.isPackaged
      ? path.join(process.resourcesPath, CF_BINARY_NAME)
      : path.join(__dirname, "..", "resources", CF_BINARY_NAME);
    if (fs.existsSync(bundled)) return bundled;

    // Check user data directory (downloaded on first run)
    const downloaded = path.join(app.getPath("userData"), CF_BINARY_NAME);
    if (fs.existsSync(downloaded)) return downloaded;

    return null;
  }

  /** Start the cloudflare tunnel. No-op if already running or no token/binary. */
  async start(): Promise<void> {
    if (this.child) return;

    const token = this.readToken();
    if (!token) return; // No token configured, skip silently

    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      this.emit("error", "cloudflared binary not found");
      return;
    }

    // Validate token format (no whitespace = no arg injection)
    if (/\s/.test(token)) {
      this.emit("error", "Invalid tunnel token format");
      return;
    }

    this.emit("connecting");

    const child = spawn(binaryPath, ["tunnel", "run", "--token", token], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child = child;

    // Monitor output for connection status
    const handleOutput = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      if (CONNECTED_RE.test(text)) {
        this.emit("connected");
      }
    };

    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", handleOutput);

    child.on("error", (err) => {
      this.child = null;
      this.emit("error", err.message);
    });

    child.on("exit", (code) => {
      this.child = null;
      if (this.status !== "disconnected") {
        this.emit("disconnected", code !== null ? `exit code ${code}` : undefined);
      }
    });
  }

  /** Gracefully stop the tunnel: SIGTERM -> 5s -> force kill */
  async stop(): Promise<void> {
    if (!this.child) {
      this.emit("disconnected");
      return;
    }

    const child = this.child;
    const pid = child.pid;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.forceKill(child, pid);
        resolve();
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(timeout);
        this.child = null;
        this.emit("disconnected");
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        this.forceKill(child, pid);
        resolve();
      }
    });
  }

  /** Force kill process. On Windows, use taskkill for process tree. */
  private forceKill(child: ChildProcess, pid: number | undefined): void {
    try {
      if (process.platform === "win32" && pid) {
        execFile("taskkill", ["/T", "/F", "/PID", String(pid)], () => {});
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Process already gone
    }
    this.child = null;
    this.emit("disconnected");
  }
}
