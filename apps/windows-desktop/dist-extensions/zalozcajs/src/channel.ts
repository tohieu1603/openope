import type {
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelDock,
  ChannelGroupContext,
  ChannelPlugin,
  OpenClawConfig,
  GroupToolPolicyConfig,
} from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk";
import type { ZcaJsFriend, ZcaJsGroup, ZcaJsUserInfo } from "./types.js";
import {
  listZalozcajsAccountIds,
  resolveDefaultZalozcajsAccountId,
  resolveZalozcajsAccountSync,
  getZcaJsUserInfo,
  checkZcaJsAuthenticated,
  type ResolvedZalozcajsAccount,
} from "./accounts.js";
import { ZalozcajsConfigSchema } from "./config-schema.js";
import { zalozcajsOnboardingAdapter } from "./onboarding.js";
import { probeZalozcajs } from "./probe.js";
import { sendMessageZalozcajs } from "./send.js";
import { collectZalozcajsStatusIssues } from "./status-issues.js";
import {
  getApiInstance,
  getAllFriends,
  getAllGroups,
  getSelfInfo,
  loginWithQR,
  disconnectInstance,
} from "./zcajs-client.js";

const meta = {
  id: "zalozcajs",
  label: "Zalo Personal (zca-js)",
  selectionLabel: "Zalo (Personal Account via zca-js)",
  docsPath: "/channels/zalozcajs",
  docsLabel: "zalozcajs",
  blurb: "Zalo personal account via zca-js library (QR code login).",
  aliases: ["zlj"],
  order: 86,
  quickstartAllowFrom: true,
};

function mapUser(params: {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  raw?: unknown;
}): ChannelDirectoryEntry {
  return {
    kind: "user",
    id: params.id,
    name: params.name ?? undefined,
    avatarUrl: params.avatarUrl ?? undefined,
    raw: params.raw,
  };
}

function mapGroup(params: {
  id: string;
  name?: string | null;
  raw?: unknown;
}): ChannelDirectoryEntry {
  return {
    kind: "group",
    id: params.id,
    name: params.name ?? undefined,
    raw: params.raw,
  };
}

function resolveZalozcajsGroupToolPolicy(
  params: ChannelGroupContext,
): GroupToolPolicyConfig | undefined {
  const account = resolveZalozcajsAccountSync({
    cfg: params.cfg,
    accountId: params.accountId ?? undefined,
  });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const groupChannel = params.groupChannel?.trim();
  const candidates = [groupId, groupChannel, "*"].filter((value): value is string =>
    Boolean(value),
  );
  for (const key of candidates) {
    const entry = groups[key];
    if (entry?.tools) {
      return entry.tools;
    }
  }
  return undefined;
}

export const zalozcajsDock: ChannelDock = {
  id: "zalozcajs",
  capabilities: {
    chatTypes: ["direct", "group"],
    media: false, // zca-js doesn't natively support media URL sending
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 2000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveZalozcajsAccountSync({ cfg: cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(zalozcajs|zlj):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  groups: {
    resolveRequireMention: () => true,
    resolveToolPolicy: resolveZalozcajsGroupToolPolicy,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
};

export const zalozcajsPlugin: ChannelPlugin<ResolvedZalozcajsAccount> = {
  id: "zalozcajs",
  meta,
  onboarding: zalozcajsOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    reactions: true,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.zalozcajs"] },
  configSchema: buildChannelConfigSchema(ZalozcajsConfigSchema),
  config: {
    listAccountIds: (cfg) => listZalozcajsAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveZalozcajsAccountSync({ cfg: cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultZalozcajsAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg,
        sectionKey: "zalozcajs",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg,
        sectionKey: "zalozcajs",
        accountId,
        clearBaseFields: [
          "credentialsPath",
          "name",
          "dmPolicy",
          "allowFrom",
          "groupPolicy",
          "groups",
          "messagePrefix",
        ],
      }),
    isConfigured: async (account) => {
      return checkZcaJsAuthenticated(account.credentialsPath);
    },
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: undefined,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveZalozcajsAccountSync({ cfg: cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(zalozcajs|zlj):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.zalozcajs?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.zalozcajs.accounts.${resolvedAccountId}.`
        : "channels.zalozcajs.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("zalozcajs"),
        normalizeEntry: (raw) => raw.replace(/^(zalozcajs|zlj):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: () => true,
    resolveToolPolicy: resolveZalozcajsGroupToolPolicy,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "zalozcajs",
        accountId,
        name,
      }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "zalozcajs",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "zalozcajs",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            zalozcajs: {
              ...next.channels?.zalozcajs,
              enabled: true,
            },
          },
        } as OpenClawConfig;
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          zalozcajs: {
            ...next.channels?.zalozcajs,
            enabled: true,
            accounts: {
              ...next.channels?.zalozcajs?.accounts,
              [accountId]: {
                ...next.channels?.zalozcajs?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  messaging: {
    normalizeTarget: (raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) {
        return undefined;
      }
      return trimmed.replace(/^(zalozcajs|zlj):/i, "");
    },
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) {
          return false;
        }
        return /^\d{3,}$/.test(trimmed);
      },
      hint: "<threadId>",
    },
  },
  directory: {
    self: async ({ cfg, accountId }) => {
      const account = resolveZalozcajsAccountSync({ cfg: cfg, accountId });
      const instance = await getApiInstance(account.credentialsPath);
      if (!instance) {
        return null;
      }
      const info = await getSelfInfo(instance);
      if (!info?.userId) {
        return null;
      }
      return mapUser({
        id: String(info.userId),
        name: info.displayName ?? null,
        avatarUrl: info.avatar ?? null,
        raw: info,
      });
    },
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveZalozcajsAccountSync({ cfg: cfg, accountId });
      const instance = await getApiInstance(account.credentialsPath);
      if (!instance) {
        throw new Error("Not authenticated");
      }
      const friends = await getAllFriends(instance);
      let rows = friends.map((f) =>
        mapUser({
          id: String(f.userId),
          name: f.displayName ?? null,
          avatarUrl: f.avatar ?? null,
          raw: f,
        }),
      );
      const q = query?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((r) => (r.name ?? "").toLowerCase().includes(q) || r.id.includes(q));
      }
      return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveZalozcajsAccountSync({ cfg: cfg, accountId });
      const instance = await getApiInstance(account.credentialsPath);
      if (!instance) {
        throw new Error("Not authenticated");
      }
      const groups = await getAllGroups(instance);
      let rows = groups.map((g) =>
        mapGroup({
          id: String(g.groupId),
          name: g.name ?? null,
          raw: g,
        }),
      );
      const q = query?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((g) => (g.name ?? "").toLowerCase().includes(q) || g.id.includes(q));
      }
      return typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;
    },
  },
  resolver: {
    resolveTargets: async ({ cfg, accountId, inputs, kind }) => {
      const results = [];
      for (const input of inputs) {
        const trimmed = input.trim();
        if (!trimmed) {
          results.push({ input, resolved: false, note: "empty input" });
          continue;
        }
        if (/^\d+$/.test(trimmed)) {
          results.push({ input, resolved: true, id: trimmed });
          continue;
        }
        try {
          const account = resolveZalozcajsAccountSync({
            cfg: cfg,
            accountId: accountId ?? DEFAULT_ACCOUNT_ID,
          });
          const instance = await getApiInstance(account.credentialsPath);
          if (!instance) {
            throw new Error("Not authenticated");
          }
          if (kind === "user") {
            const friends = await getAllFriends(instance);
            const matches = friends
              .filter((f) => f.displayName?.toLowerCase().includes(trimmed.toLowerCase()))
              .map((f) => ({ id: String(f.userId), name: f.displayName }));
            const best = matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : undefined,
            });
          } else {
            const groups = await getAllGroups(instance);
            const matches = groups
              .filter((g) => g.name?.toLowerCase().includes(trimmed.toLowerCase()))
              .map((g) => ({ id: String(g.groupId), name: g.name }));
            const best =
              matches.find((g) => g.name?.toLowerCase() === trimmed.toLowerCase()) ?? matches[0];
            results.push({
              input,
              resolved: Boolean(best?.id),
              id: best?.id,
              name: best?.name,
              note: matches.length > 1 ? "multiple matches; chose first" : undefined,
            });
          }
        } catch (err) {
          results.push({ input, resolved: false, note: "lookup failed" });
        }
      }
      return results;
    },
  },
  pairing: {
    idLabel: "zalozcajsUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(zalozcajs|zlj):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveZalozcajsAccountSync({ cfg: cfg });
      const authenticated = await checkZcaJsAuthenticated(account.credentialsPath);
      if (!authenticated) {
        throw new Error("Zalozcajs not authenticated");
      }
      await sendMessageZalozcajs(id, "Your pairing request has been approved.", {
        credentialsPath: account.credentialsPath,
      });
    },
  },
  auth: {
    login: async ({ cfg, accountId, runtime }) => {
      const account = resolveZalozcajsAccountSync({
        cfg: cfg,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      });
      runtime.log(
        `Scan the QR code to link Zalo Personal via zca-js (account: ${account.accountId}).`,
      );
      try {
        await loginWithQR(account.accountId === DEFAULT_ACCOUNT_ID ? "default" : account.accountId);
      } catch (err) {
        throw new Error(
          `Zalozcajs login failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) {
        return [];
      }
      if (limit <= 0 || text.length <= limit) {
        return [text];
      }
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        const lastNewline = window.lastIndexOf("\n");
        const lastSpace = window.lastIndexOf(" ");
        let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
        if (breakIdx <= 0) {
          breakIdx = limit;
        }
        const rawChunk = remaining.slice(0, breakIdx);
        const chunk = rawChunk.trimEnd();
        if (chunk.length > 0) {
          chunks.push(chunk);
        }
        const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
        const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
        remaining = remaining.slice(nextStart).trimStart();
      }
      if (remaining.length) {
        chunks.push(remaining);
      }
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = resolveZalozcajsAccountSync({ cfg: cfg, accountId });
      const result = await sendMessageZalozcajs(to, text, {
        credentialsPath: account.credentialsPath,
      });
      return {
        channel: "zalozcajs",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectZalozcajsStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      probeZalozcajs(account.credentialsPath, timeoutMs),
    buildAccountSnapshot: async ({ account, runtime }) => {
      const configured = await checkZcaJsAuthenticated(account.credentialsPath);
      const configError = "not authenticated (no saved credentials)";
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: configured ? (runtime?.lastError ?? null) : (runtime?.lastError ?? configError),
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "pairing",
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      let userLabel = "";
      try {
        const userInfo = await getZcaJsUserInfo(account.credentialsPath);
        if (userInfo?.displayName) {
          userLabel = ` (${userInfo.displayName})`;
        }
        ctx.setStatus({
          accountId: account.accountId,
          user: userInfo,
        });
      } catch {
        // ignore probe errors
      }
      ctx.log?.info(`[${account.accountId}] starting zalozcajs provider${userLabel}`);
      const { monitorZalozcajsProvider } = await import("./monitor.js");
      return monitorZalozcajsProvider({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
    logoutAccount: async (ctx) => {
      disconnectInstance(ctx.account.credentialsPath);
      return {
        cleared: true,
        loggedOut: true,
        message: "Disconnected and credentials cleared",
      };
    },
  },
};

export type { ResolvedZalozcajsAccount };
