/**
 * First-run detection and config management for Agent Operis Desktop.
 * Creates minimal gateway config on first run; ensures Electron-specific
 * settings on every startup.
 */
import path from "node:path";
import fs from "node:fs";

export class OnboardManager {
  /**
   * Path to OpenClaw config file.
   * Config lives at ~/.openclaw/openclaw.json on all platforms.
   */
  private get configFilePath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    return path.join(home, ".openclaw", "openclaw.json");
  }

  /**
   * Check if OpenClaw config already exists.
   */
  isConfigured(): boolean {
    return fs.existsSync(this.configFilePath);
  }

  /**
   * Create minimal gateway config without Anthropic token.
   * Gateway starts and serves HTTP/hooks; Anthropic token is synced later
   * by the backend via POST /hooks/sync-auth-profiles through the tunnel.
   */
  createMinimalConfig(): void {
    const configDir = path.dirname(this.configFilePath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Generate random tokens for gateway auth and hooks
    const randomHex = (bytes: number) =>
      Array.from({ length: bytes }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
      ).join("");
    const gatewayToken = randomHex(24);
    const hooksToken = randomHex(24);

    const config = {
      gateway: {
        mode: "local",
        auth: { mode: "token", token: gatewayToken },
        port: 18789,
        bind: "loopback",
        http: { endpoints: { chatCompletions: { enabled: true } } },
        controlUi: { enabled: false, allowedOrigins: ["file://"] },
      },
      hooks: { enabled: true, token: hooksToken },
      auth: { profiles: {} },
      browser: { defaultProfile: "openclaw" },
    };

    fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Read the gateway auth token from config (for passing to UI via URL query).
   */
  readGatewayToken(): string | null {
    try {
      const raw = fs.readFileSync(this.configFilePath, "utf-8");
      return JSON.parse(raw)?.gateway?.auth?.token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Ensure the default agent directory and empty auth-profiles.json exist.
   * Gateway creates these lazily, but having them ready avoids race conditions
   * where the backend tries to sync before the agent has run once.
   */
  ensureAgentAuthStore(): void {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const agentDir = path.join(home, ".openclaw", "agents", "main", "agent");
    const authPath = path.join(agentDir, "auth-profiles.json");

    if (fs.existsSync(authPath)) return;

    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    const defaultStore = {
      version: 1,
      profiles: {
        "anthropic:manual": { type: "token", provider: "anthropic", token: "" },
        "anthropic:default": { type: "token", provider: "anthropic", token: "" },
      },
      lastGood: { anthropic: "anthropic:default" },
      usageStats: {
        "anthropic:manual": { lastUsed: 0, errorCount: 0 },
        "anthropic:default": { lastUsed: 0, errorCount: 0 },
      },
    };
    fs.writeFileSync(authPath, JSON.stringify(defaultStore, null, 2), "utf-8");
  }

  /**
   * Ensure gateway config has Electron-specific settings (idempotent).
   * Called after onboard and on every app startup.
   * - Enables /v1/chat/completions HTTP endpoint
   * - Allows file:// origin for WebSocket (Electron loads UI from file://)
   * - Sets browser default profile to "openclaw" (independent browser, no Chrome extension needed)
   */
  ensureElectronConfig(): void {
    try {
      const raw = fs.readFileSync(this.configFilePath, "utf-8");
      const config = JSON.parse(raw);
      let modified = false;

      // Enable chatCompletions endpoint
      config.gateway ??= {};
      config.gateway.http ??= {};
      config.gateway.http.endpoints ??= {};
      config.gateway.http.endpoints.chatCompletions ??= {};
      if (config.gateway.http.endpoints.chatCompletions.enabled !== true) {
        config.gateway.http.endpoints.chatCompletions.enabled = true;
        modified = true;
      }

      // Disable control UI served by gateway (Electron loads UI from local file://)
      // Prevents exposing the UI via Cloudflare tunnel — only API endpoints remain accessible
      config.gateway.controlUi ??= {};
      if (config.gateway.controlUi.enabled !== false) {
        config.gateway.controlUi.enabled = false;
        modified = true;
      }
      const origins = config.gateway.controlUi.allowedOrigins ?? [];
      if (!origins.includes("file://")) {
        origins.push("file://");
        config.gateway.controlUi.allowedOrigins = origins;
        modified = true;
      }

      // Enable hooks system so backend can push auth profiles via tunnel
      config.hooks ??= {};
      if (config.hooks.enabled !== true) {
        config.hooks.enabled = true;
        modified = true;
      }
      if (!config.hooks.token) {
        const randomHex = (bytes: number) =>
          Array.from({ length: bytes }, () =>
            Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
          ).join("");
        config.hooks.token = randomHex(24);
        modified = true;
      }

      // Use independent openclaw browser (agent launches its own Chrome via CDP)
      // instead of default "chrome" extension relay which requires a Chrome extension
      config.browser ??= {};
      if (config.browser.defaultProfile !== "openclaw") {
        config.browser.defaultProfile = "openclaw";
        modified = true;
      }

      // Remove stale executablePath if file no longer exists (e.g. app moved to different machine)
      // Gateway auto-detects Edge/Chrome/Brave dynamically — no need to persist a machine-specific path
      if (config.browser.executablePath && !fs.existsSync(config.browser.executablePath)) {
        delete config.browser.executablePath;
        modified = true;
      }

      // Disable Chrome sandbox: required when gateway spawns Chrome as a child of Electron
      if (config.browser.noSandbox !== true) {
        config.browser.noSandbox = true;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
      }
    } catch {
      // Config may not exist yet
    }
  }
}
