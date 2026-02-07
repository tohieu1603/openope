/**
 * Gateway process manager for Electron desktop app.
 * Spawns Node.js gateway as child process, monitors health via TCP,
 * handles crash recovery with exponential backoff, graceful shutdown.
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

export class GatewayManager {
  private child: ChildProcess | null = null;
  private status: GatewayStatus = "stopped";
  private restartCount = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: StatusListener[] = [];
  private shuttingDown = false;

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

  /** Start the gateway process. No-op if already running. */
  async start(): Promise<void> {
    if (this.child) return;
    this.shuttingDown = false;
    this.spawnGateway();
  }

  private spawnGateway(): void {
    const entryPath = this.resolveEntryPath();

    if (!fs.existsSync(entryPath)) {
      this.emit("error", `Gateway not found at ${entryPath}`);
      return;
    }

    this.emit("starting");

    const child = spawn(process.execPath, [entryPath, "gateway"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Prevent entry.ts self-respawn loop
        OPENCLAW_NO_RESPAWN: "1",
      },
      windowsHide: true,
    });

    this.child = child;

    child.stdout?.on("data", () => {
      /* gateway stdout - could pipe to log file in future */
    });
    child.stderr?.on("data", () => {
      /* gateway stderr - could pipe to log file in future */
    });

    child.on("error", (err) => {
      this.child = null;
      this.stopHealthCheck();
      if (!this.shuttingDown) {
        this.emit("error", err.message);
        this.scheduleRestart();
      }
    });

    child.on("exit", (code) => {
      this.child = null;
      this.stopHealthCheck();
      if (this.shuttingDown) {
        this.emit("stopped");
        return;
      }
      this.emit("error", `Gateway exited with code ${code}`);
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
