import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk";

type ZalozcajsAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  dmPolicy?: unknown;
  lastError?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

function readZalozcajsAccountStatus(value: ChannelAccountSnapshot): ZalozcajsAccountStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    dmPolicy: value.dmPolicy,
    lastError: value.lastError,
  };
}

export function collectZalozcajsStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readZalozcajsAccountStatus(entry);
    if (!account) {
      continue;
    }
    const accountId = asString(account.accountId) ?? "default";
    const enabled = account.enabled !== false;
    if (!enabled) {
      continue;
    }

    const configured = account.configured === true;
    const lastError = asString(account.lastError)?.trim();

    if (!configured) {
      issues.push({
        channel: "zalozcajs",
        accountId,
        kind: "auth",
        message: "Not authenticated (no saved credentials).",
        fix: "Run: openclaw channels login --channel zalozcajs",
      });
      continue;
    }

    if (account.dmPolicy === "open") {
      issues.push({
        channel: "zalozcajs",
        accountId,
        kind: "config",
        message:
          'Zalo Personal (zca-js) dmPolicy is "open", allowing any user to message the bot without pairing.',
        fix: 'Set channels.zalozcajs.dmPolicy to "pairing" or "allowlist" to restrict access.',
      });
    }
  }
  return issues;
}
