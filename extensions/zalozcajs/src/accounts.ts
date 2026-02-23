import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { ResolvedZalozcajsAccount, ZalozcajsAccountConfig, ZalozcajsConfig } from "./types.js";
import {
  resolveCredentialsPath,
  hasCredentials,
  getApiInstance,
  getSelfInfo,
} from "./zcajs-client.js";

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = (cfg.channels?.zalozcajs as ZalozcajsConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listZalozcajsAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultZalozcajsAccountId(cfg: OpenClawConfig): string {
  const zcajsConfig = cfg.channels?.zalozcajs as ZalozcajsConfig | undefined;
  if (zcajsConfig?.defaultAccount?.trim()) {
    return zcajsConfig.defaultAccount.trim();
  }
  const ids = listZalozcajsAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ZalozcajsAccountConfig | undefined {
  const accounts = (cfg.channels?.zalozcajs as ZalozcajsConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as ZalozcajsAccountConfig | undefined;
}

function mergeZalozcajsAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ZalozcajsAccountConfig {
  const raw = (cfg.channels?.zalozcajs ?? {}) as ZalozcajsConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function resolveCredentials(config: ZalozcajsAccountConfig, accountId: string): string {
  if (config.credentialsPath?.trim()) {
    return config.credentialsPath.trim();
  }
  return resolveCredentialsPath(accountId !== DEFAULT_ACCOUNT_ID ? accountId : "default");
}

export async function checkZcaJsAuthenticated(credentialsPath: string): Promise<boolean> {
  return hasCredentials(credentialsPath);
}

export async function resolveZalozcajsAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<ResolvedZalozcajsAccount> {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.zalozcajs as ZalozcajsConfig | undefined)?.enabled !== false;
  const merged = mergeZalozcajsAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const credentialsPath = resolveCredentials(merged, accountId);
  const authenticated = await checkZcaJsAuthenticated(credentialsPath);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    credentialsPath,
    authenticated,
    config: merged,
  };
}

export function resolveZalozcajsAccountSync(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedZalozcajsAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.zalozcajs as ZalozcajsConfig | undefined)?.enabled !== false;
  const merged = mergeZalozcajsAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const credentialsPath = resolveCredentials(merged, accountId);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    credentialsPath,
    authenticated: false, // unknown without async check
    config: merged,
  };
}

export async function listEnabledZalozcajsAccounts(
  cfg: OpenClawConfig,
): Promise<ResolvedZalozcajsAccount[]> {
  const ids = listZalozcajsAccountIds(cfg);
  const accounts = await Promise.all(
    ids.map((accountId) => resolveZalozcajsAccount({ cfg, accountId })),
  );
  return accounts.filter((account) => account.enabled);
}

export async function getZcaJsUserInfo(
  credentialsPath: string,
): Promise<{ userId?: string; displayName?: string } | null> {
  const instance = await getApiInstance(credentialsPath);
  if (!instance) {
    return null;
  }
  return getSelfInfo(instance);
}

export type { ResolvedZalozcajsAccount } from "./types.js";
