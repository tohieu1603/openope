/**
 * First-run detection and config management for Agent Operis Desktop.
 * Creates minimal gateway config on first run; ensures Electron-specific
 * settings on every startup.
 *
 * BytePlus provider preset is always bundled and deep-merged on first run.
 */
import path from "node:path";
import fs from "node:fs";

export class OnboardManager {
  private readonly stateDir: string;

  /** @param stateDir Override the state directory (default: ~/.operis). */
  constructor(stateDir?: string) {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    this.stateDir = stateDir || path.join(home, ".operis");
  }

  /** Path to Operis config file inside the state directory */
  private get configFilePath(): string {
    return path.join(this.stateDir, "operis.json");
  }

  /** Check if Operis config already exists. */
  isConfigured(): boolean {
    return fs.existsSync(this.configFilePath);
  }

  /**
   * Create minimal gateway config without Anthropic token.
   * Gateway starts and serves HTTP/hooks; Anthropic token is synced later
   * by the backend via POST /hooks/sync-auth-profiles through the tunnel.
   */
  createMinimalConfig(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }

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
      plugins: {
        entries: {
          zalozcajs: { enabled: true },
        },
      },
      channels: {
        zalozcajs: { enabled: true, dmPolicy: "open" },
      },
    };

    fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Apply a preset config (deep-merge) on top of existing config.
   * Injects provider/model defaults from bundled preset on first run.
   */
  applyPreset(presetPath: string): void {
    try {
      const presetRaw = fs.readFileSync(presetPath, "utf-8");
      const preset = JSON.parse(presetRaw);
      const configRaw = fs.readFileSync(this.configFilePath, "utf-8");
      const config = JSON.parse(configRaw);

      const merged = deepMerge(config, preset);
      fs.writeFileSync(this.configFilePath, JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
      console.error("[onboard] Failed to apply preset:", err);
    }
  }

  /**
   * Ensure preset defaults exist in the user's config (idempotent).
   * Called on every app startup — fills in missing keys from the preset
   * without overwriting anything the user has already configured.
   */
  ensurePresetDefaults(presetPath: string): void {
    try {
      const presetRaw = fs.readFileSync(presetPath, "utf-8");
      const preset = JSON.parse(presetRaw);
      const configRaw = fs.readFileSync(this.configFilePath, "utf-8");
      const config = JSON.parse(configRaw);

      const merged = deepMergeDefaults(config, preset);
      const mergedStr = JSON.stringify(merged, null, 2);
      // Only write if something actually changed
      if (mergedStr !== JSON.stringify(config, null, 2)) {
        fs.writeFileSync(this.configFilePath, mergedStr, "utf-8");
      }
    } catch (err) {
      console.error("[onboard] Failed to ensure preset defaults:", err);
    }
  }

  /** Read the gateway auth token from config (for passing to UI via URL query). */
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
    const agentDir = path.join(this.stateDir, "agents", "main", "agent");
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
      config.browser ??= {};
      if (config.browser.defaultProfile !== "openclaw") {
        config.browser.defaultProfile = "openclaw";
        modified = true;
      }

      // Remove stale executablePath if file no longer exists
      if (config.browser.executablePath && !fs.existsSync(config.browser.executablePath)) {
        delete config.browser.executablePath;
        modified = true;
      }

      // Disable Chrome sandbox: required when gateway spawns Chrome as a child of Electron
      if (config.browser.noSandbox !== true) {
        config.browser.noSandbox = true;
        modified = true;
      }

      // Enable zalozcajs plugin (bundled Zalo personal account via zca-js)
      config.plugins ??= {};
      config.plugins.entries ??= {};
      config.plugins.entries.zalozcajs ??= {};
      if (config.plugins.entries.zalozcajs.enabled !== true) {
        config.plugins.entries.zalozcajs.enabled = true;
        modified = true;
      }

      // Enable zalozcajs channel with open DM policy
      config.channels ??= {};
      config.channels.zalozcajs ??= {};
      if (config.channels.zalozcajs.enabled !== true) {
        config.channels.zalozcajs.enabled = true;
        modified = true;
      }
      if (!config.channels.zalozcajs.dmPolicy) {
        config.channels.zalozcajs.dmPolicy = "open";
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

/**
 * Simple recursive deep merge: source values override target values.
 * Arrays are replaced (not concatenated) to keep preset models list exact.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/**
 * Deep merge where target (user config) wins — only fills missing keys from source (preset).
 * Objects are recursed; existing leaf values are never overwritten.
 */
function deepMergeDefaults(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (tgtVal === undefined) {
      // Key missing in user config — add from preset
      result[key] = srcVal;
    } else if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      // Both are objects — recurse to fill nested missing keys
      result[key] = deepMergeDefaults(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    }
    // Otherwise: user already has a value — keep it
  }
  return result;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
