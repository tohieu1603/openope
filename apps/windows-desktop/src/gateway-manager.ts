/**
 * Gateway process manager for Electron desktop app.
 * Spawns Node.js gateway as child process, monitors health via TCP,
 * handles crash recovery with exponential backoff, graceful shutdown,
 * and captures stdout/stderr to log file for debugging.
 */
import { spawn, type ChildProcess, execFile } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";
import { GATEWAY_PORT, type GatewayStatus } from "./types";

type StatusListener = (status: GatewayStatus, detail?: string) => void;

const HEALTH_CHECK_INTERVAL_MS = 5_000;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const MAX_LOG_LINES = 200;
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export class GatewayManager {
  private child: ChildProcess | null = null;
  private status: GatewayStatus = "stopped";
  private restartCount = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: StatusListener[] = [];
  private shuttingDown = false;
  private logStream: fs.WriteStream | null = null;
  private recentLogs: string[] = [];

  /** Gateway auth token — passed via env to ensure stability across config reloads */
  gatewayToken: string | null = null;

  get currentStatus(): GatewayStatus {
    return this.status;
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatus(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(status: GatewayStatus, detail?: string): void {
    this.status = status;
    for (const l of this.listeners) l(status, detail);
  }

  /** Resolve path to gateway entry.js (dev vs packaged) */
  private resolveEntryPath(): string {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, "gateway")
      : path.join(__dirname, "..", "..", "..", "dist");
    return path.join(base, "entry.js");
  }

  /** Get recent gateway logs (in-memory buffer) */
  getRecentLogs(): string[] {
    return [...this.recentLogs];
  }

  /** Get path to gateway log file */
  getLogFilePath(): string {
    return path.join(app.getPath("userData"), "gateway.log");
  }

  /** Append line to both log file and in-memory buffer */
  private appendLog(source: string, text: string): void {
    const line = `[${new Date().toISOString()}] [${source}] ${text}`;
    this.recentLogs.push(line);
    if (this.recentLogs.length > MAX_LOG_LINES) {
      this.recentLogs = this.recentLogs.slice(-MAX_LOG_LINES);
    }
    if (this.logStream) {
      this.logStream.write(line + "\n");
    }
  }

  /** Rotate log file if it exceeds the size limit */
  private rotateLogIfNeeded(): void {
    try {
      const logPath = this.getLogFilePath();
      if (!fs.existsSync(logPath)) return;
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_FILE_BYTES) {
        const oldPath = logPath + ".old";
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(logPath, oldPath);
      }
    } catch {
      // Ignore rotation errors
    }
  }

  /** Open log file stream for writing */
  private openLogStream(): void {
    try {
      this.rotateLogIfNeeded();
      const logPath = this.getLogFilePath();
      this.logStream = fs.createWriteStream(logPath, { flags: "a" });
      this.appendLog("system", "--- Gateway starting ---");
    } catch {
      // Log directory may not exist yet
    }
  }

  /** Close log file stream */
  private closeLogStream(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /** Start the gateway process. No-op if already running. */
  async start(): Promise<void> {
    if (this.child) return;
    this.shuttingDown = false;
    this.openLogStream();
    this.spawnGateway();
  }

  private spawnGateway(): void {
    const entryPath = this.resolveEntryPath();

    if (!fs.existsSync(entryPath)) {
      this.emit("error", `Gateway not found at ${entryPath}`);
      return;
    }

    this.emit("starting");
    this.appendLog("system", "Starting gateway process...");

    // Resolve bundled plugins directory
    const pluginsDir = app.isPackaged
      ? path.join(process.resourcesPath, "extensions")
      : path.join(__dirname, "..", "..", "..", "dist-extensions");

    // Resolve gateway node_modules for native packages (sharp, @lydell/node-pty)
    const gatewayNodeModules = app.isPackaged
      ? path.join(process.resourcesPath, "gateway", "node_modules")
      : path.join(__dirname, "..", "..", "..", "node_modules");

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ELECTRON_RUN_AS_NODE: "1",
      OPENCLAW_NO_RESPAWN: "1",
      OPENCLAW_BUNDLED_PLUGINS_DIR: pluginsDir,
      NODE_PATH: gatewayNodeModules,
    };
    // Pass gateway token via env to survive config hot-reloads
    if (this.gatewayToken) {
      env.OPENCLAW_GATEWAY_TOKEN = this.gatewayToken;
    }
    const child = spawn(process.execPath, [entryPath, "gateway"], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
    });

    this.child = child;

    // Capture stdout
    child.stdout?.on("data", (chunk: Buffer) => {
      this.appendLog("stdout", chunk.toString().trimEnd());
    });

    // Capture stderr
    let lastStderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trimEnd();
      lastStderr = text;
      this.appendLog("stderr", text);
    });

    child.on("error", (err) => {
      this.appendLog("error", err.message);
      this.child = null;
      this.stopHealthCheck();
      if (!this.shuttingDown) {
        const detail = lastStderr ? `${err.message}: ${lastStderr}` : err.message;
        this.emit("error", detail);
        this.scheduleRestart();
      }
    });

    child.on("exit", (code) => {
      this.appendLog("exit", `code ${code}`);
      this.child = null;
      this.stopHealthCheck();
      if (this.shuttingDown) {
        this.emit("stopped");
        return;
      }
      const detail = lastStderr
        ? `Gateway exited with code ${code}: ${lastStderr}`
        : `Gateway exited with code ${code}`;
      this.emit("error", detail);
      this.scheduleRestart();
    });

    this.startHealthCheck();
  }

  /**
   * TCP health check - verify gateway port is accepting connections.
   * Simpler and more reliable than HTTP since gateway has no /health route.
   */
  private checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(
        { host: "127.0.0.1", port: GATEWAY_PORT, timeout: HEALTH_CHECK_TIMEOUT_MS },
        () => {
          socket.destroy();
          resolve(true);
        },
      );
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(() => {
      this.checkHealth()
        .then((ok) => {
          if (ok && this.status !== "running") {
            this.restartCount = 0;
            this.appendLog("health", "Gateway is healthy");
            this.emit("running");
          }
        })
        .catch(() => {});
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /** Schedule restart with exponential backoff */
  private scheduleRestart(): void {
    if (this.shuttingDown) return;

    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.restartCount, MAX_BACKOFF_MS);
    this.restartCount++;
    this.appendLog("system", `Scheduling restart in ${delay}ms (attempt ${this.restartCount})`);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.shuttingDown) {
        this.spawnGateway();
      }
    }, delay);
  }

  /** Gracefully stop gateway: SIGTERM -> timeout -> force kill */
  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.stopHealthCheck();
    this.closeLogStream();

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (!this.child) {
      this.emit("stopped");
      return;
    }

    const child = this.child;
    const pid = child.pid;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill after timeout
        this.forceKill(child, pid);
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      child.once("exit", () => {
        clearTimeout(timeout);
        this.child = null;
        this.emit("stopped");
        resolve();
      });

      // Attempt graceful termination
      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        this.forceKill(child, pid);
        resolve();
      }
    });
  }

  /** Force kill process. On Windows, use taskkill to kill process tree. */
  private forceKill(child: ChildProcess, pid: number | undefined): void {
    try {
      if (process.platform === "win32" && pid) {
        // Kill entire process tree on Windows
        execFile("taskkill", ["/T", "/F", "/PID", String(pid)], () => {});
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Process already gone
    }
    this.child = null;
    this.emit("stopped");
  }
}
