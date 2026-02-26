import type { OpenClawConfig, MarkdownTableMode, RuntimeEnv } from "openclaw/plugin-sdk";
import { existsSync } from "node:fs";
import { createReplyPrefixOptions, mergeAllowlist, summarizeMapping } from "openclaw/plugin-sdk";
import type { ResolvedZalozcajsAccount, ZcaJsFriend, ZcaJsGroup, ZcaJsMessage } from "./types.js";
import { getZalozcajsRuntime } from "./runtime.js";
import { sendMessageZalozcajs } from "./send.js";
import {
  getApiInstance,
  getAllFriends,
  getAllGroups,
  startListener,
  disconnectInstance,
} from "./zcajs-client.js";

export type ZalozcajsMonitorOptions = {
  account: ResolvedZalozcajsAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type ZalozcajsMonitorResult = {
  stop: () => void;
};

const ZALOZCAJS_TEXT_LIMIT = 2000;

function normalizeZalozcajsEntry(entry: string): string {
  return entry.replace(/^(zalozcajs|zlj):/i, "").trim();
}

function buildNameIndex<T>(items: T[], nameFn: (item: T) => string | undefined): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const name = nameFn(item)?.trim().toLowerCase();
    if (!name) {
      continue;
    }
    const list = index.get(name) ?? [];
    list.push(item);
    index.set(name, list);
  }
  return index;
}

type ZalozcajsCoreRuntime = ReturnType<typeof getZalozcajsRuntime>;

function logVerbose(core: ZalozcajsCoreRuntime, runtime: RuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log(`[zalozcajs] ${message}`);
  }
}

function isSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  if (allowFrom.includes("*")) {
    return true;
  }
  const normalizedSenderId = senderId.toLowerCase();
  return allowFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(zalozcajs|zlj):/i, "");
    return normalized === normalizedSenderId;
  });
}

function normalizeGroupSlug(raw?: string | null): string {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isGroupAllowed(params: {
  groupId: string;
  groupName?: string | null;
  groups: Record<string, { allow?: boolean; enabled?: boolean }>;
}): boolean {
  const groups = params.groups ?? {};
  const keys = Object.keys(groups);
  if (keys.length === 0) {
    return false;
  }
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? ""),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const entry = groups[candidate];
    if (!entry) {
      continue;
    }
    return entry.allow !== false && entry.enabled !== false;
  }
  const wildcard = groups["*"];
  if (wildcard) {
    return wildcard.allow !== false && wildcard.enabled !== false;
  }
  return false;
}

async function processMessage(
  message: ZcaJsMessage,
  account: ResolvedZalozcajsAccount,
  config: OpenClawConfig,
  core: ZalozcajsCoreRuntime,
  runtime: RuntimeEnv,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
): Promise<void> {
  const { threadId, content, timestamp, isGroup, senderId, senderName, groupName } = message;
  if (!content?.trim()) {
    return;
  }

  const chatId = threadId;
  const effectiveSenderId = senderId ?? threadId;

  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "open";
  const groups = account.config.groups ?? {};
  if (isGroup) {
    if (groupPolicy === "disabled") {
      logVerbose(core, runtime, `zalozcajs: drop group ${chatId} (groupPolicy=disabled)`);
      return;
    }
    if (groupPolicy === "allowlist") {
      const allowed = isGroupAllowed({ groupId: chatId, groupName, groups });
      if (!allowed) {
        logVerbose(core, runtime, `zalozcajs: drop group ${chatId} (not allowlisted)`);
        return;
      }
    }
  }

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const configAllowFrom = (account.config.allowFrom ?? []).map((v) => String(v));
  const rawBody = content.trim();
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore("zalozcajs").catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(effectiveSenderId, effectiveAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  if (!isGroup) {
    if (dmPolicy === "disabled") {
      logVerbose(
        core,
        runtime,
        `Blocked zalozcajs DM from ${effectiveSenderId} (dmPolicy=disabled)`,
      );
      return;
    }

    if (dmPolicy !== "open") {
      const allowed = senderAllowedForCommands;

      if (!allowed) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "zalozcajs",
            id: effectiveSenderId,
            meta: { name: senderName || undefined },
          });

          if (created) {
            logVerbose(core, runtime, `zalozcajs pairing request sender=${effectiveSenderId}`);
            try {
              await sendMessageZalozcajs(
                chatId,
                core.channel.pairing.buildPairingReply({
                  channel: "zalozcajs",
                  idLine: `Your Zalo user id: ${effectiveSenderId}`,
                  code,
                }),
                { credentialsPath: account.credentialsPath },
              );
              statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerbose(
                core,
                runtime,
                `zalozcajs pairing reply failed for ${effectiveSenderId}: ${String(err)}`,
              );
            }
          }
        } else {
          logVerbose(
            core,
            runtime,
            `Blocked unauthorized zalozcajs sender ${effectiveSenderId} (dmPolicy=${dmPolicy})`,
          );
        }
        return;
      }
    }
  }

  if (
    isGroup &&
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(
      core,
      runtime,
      `zalozcajs: drop control command from unauthorized sender ${effectiveSenderId}`,
    );
    return;
  }

  const peer = isGroup
    ? { kind: "group" as const, id: chatId }
    : { kind: "group" as const, id: effectiveSenderId };

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "zalozcajs",
    accountId: account.accountId,
    peer: {
      kind: peer.kind,
      id: peer.id,
    },
  });

  const fromLabel = isGroup ? `group:${chatId}` : senderName || `user:${effectiveSenderId}`;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Zalo Personal (zca-js)",
    from: fromLabel,
    timestamp: timestamp ? timestamp * 1000 : undefined,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `zalozcajs:group:${chatId}` : `zalozcajs:${effectiveSenderId}`,
    To: `zalozcajs:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: senderName || undefined,
    SenderId: effectiveSenderId,
    CommandAuthorized: commandAuthorized,
    Provider: "zalozcajs",
    Surface: "zalozcajs",
    MessageSid: message.msgId ?? `${timestamp}`,
    OriginatingChannel: "zalozcajs",
    OriginatingTo: `zalozcajs:${chatId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`zalozcajs: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "zalozcajs",
    accountId: account.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        await deliverZalozcajsReply({
          payload: payload as { text?: string; mediaUrls?: string[]; mediaUrl?: string },
          credentialsPath: account.credentialsPath,
          chatId,
          isGroup,
          runtime,
          core,
          config,
          accountId: account.accountId,
          statusSink,
          tableMode: core.channel.text.resolveMarkdownTableMode({
            cfg: config,
            channel: "zalozcajs",
            accountId: account.accountId,
          }),
        });
      },
      onError: (err, info) => {
        runtime.error(`[${account.accountId}] Zalozcajs ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

async function deliverZalozcajsReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string };
  credentialsPath: string;
  chatId: string;
  isGroup: boolean;
  runtime: RuntimeEnv;
  core: ZalozcajsCoreRuntime;
  config: OpenClawConfig;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  tableMode?: MarkdownTableMode;
}): Promise<void> {
  const {
    payload,
    credentialsPath,
    chatId,
    isGroup,
    runtime,
    core,
    config,
    accountId,
    statusSink,
  } = params;
  const tableMode = params.tableMode ?? "code";
  const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);

  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];

  if (mediaList.length > 0) {
    let first = true;
    for (const mediaUrl of mediaList) {
      const caption = first ? text : undefined;
      first = false;
      try {
        logVerbose(core, runtime, `Sending media to ${chatId}`);
        await sendMessageZalozcajs(chatId, caption ?? "", {
          credentialsPath,
          mediaUrl,
          isGroup,
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Zalozcajs media send failed: ${String(err)}`);
      }
    }
    return;
  }

  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "zalozcajs", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(
      text,
      ZALOZCAJS_TEXT_LIMIT,
      chunkMode,
    );
    logVerbose(core, runtime, `Sending ${chunks.length} text chunk(s) to ${chatId}`);
    for (const chunk of chunks) {
      try {
        await sendMessageZalozcajs(chatId, chunk, { credentialsPath, isGroup });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Zalozcajs message send failed: ${String(err)}`);
      }
    }
  }
}

export async function monitorZalozcajsProvider(
  options: ZalozcajsMonitorOptions,
): Promise<ZalozcajsMonitorResult> {
  let { account, config } = options;
  const { abortSignal, statusSink, runtime } = options;

  const core = getZalozcajsRuntime();
  let stopped = false;
  let listenerHandle: { stop: () => void } | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveRunning: (() => void) | null = null;

  // Resolve allowFrom names to user IDs using zca-js friend list
  try {
    const allowFromEntries = (account.config.allowFrom ?? [])
      .map((entry) => normalizeZalozcajsEntry(String(entry)))
      .filter((entry) => entry && entry !== "*");

    if (allowFromEntries.length > 0) {
      const instance = await getApiInstance(account.credentialsPath);
      if (instance) {
        const friends = await getAllFriends(instance);
        const byName = buildNameIndex(friends, (friend) => friend.displayName);
        const additions: string[] = [];
        const mapping: string[] = [];
        const unresolved: string[] = [];
        for (const entry of allowFromEntries) {
          if (/^\d+$/.test(entry)) {
            additions.push(entry);
            continue;
          }
          const matches = byName.get(entry.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.userId ? String(match.userId) : undefined;
          if (id) {
            additions.push(id);
            mapping.push(`${entry}→${id}`);
          } else {
            unresolved.push(entry);
          }
        }
        const allowFrom = mergeAllowlist({ existing: account.config.allowFrom, additions });
        account = {
          ...account,
          config: {
            ...account.config,
            allowFrom,
          },
        };
        summarizeMapping("zalozcajs users", mapping, unresolved, runtime);
      }
    }

    const groupsConfig = account.config.groups ?? {};
    const groupKeys = Object.keys(groupsConfig).filter((key) => key !== "*");
    if (groupKeys.length > 0) {
      const instance = await getApiInstance(account.credentialsPath);
      if (instance) {
        const groups = await getAllGroups(instance);
        const byName = buildNameIndex(groups, (group) => group.name);
        const mapping: string[] = [];
        const unresolved: string[] = [];
        const nextGroups = { ...groupsConfig };
        for (const entry of groupKeys) {
          const cleaned = normalizeZalozcajsEntry(entry);
          if (/^\d+$/.test(cleaned)) {
            if (!nextGroups[cleaned]) {
              nextGroups[cleaned] = groupsConfig[entry];
            }
            mapping.push(`${entry}→${cleaned}`);
            continue;
          }
          const matches = byName.get(cleaned.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.groupId ? String(match.groupId) : undefined;
          if (id) {
            if (!nextGroups[id]) {
              nextGroups[id] = groupsConfig[entry];
            }
            mapping.push(`${entry}→${id}`);
          } else {
            unresolved.push(entry);
          }
        }
        account = {
          ...account,
          config: {
            ...account.config,
            groups: nextGroups,
          },
        };
        summarizeMapping("zalozcajs groups", mapping, unresolved, runtime);
      }
    }
  } catch (err) {
    runtime.log?.(`zalozcajs resolve failed; using config entries. ${String(err)}`);
  }

  // Poll credentials file; auto-stop when removed (e.g. operis-api disconnect)
  let credentialsWatcher: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    stopped = true;
    if (credentialsWatcher) {
      clearInterval(credentialsWatcher);
      credentialsWatcher = null;
    }
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (listenerHandle) {
      listenerHandle.stop();
      listenerHandle = null;
    }
    disconnectInstance(account.credentialsPath);
    resolveRunning?.();
  };

  const startListenerLoop = async () => {
    if (stopped || abortSignal.aborted) {
      resolveRunning?.();
      return;
    }

    logVerbose(
      core,
      runtime,
      `[${account.accountId}] starting zca-js listener (credentials=${account.credentialsPath})`,
    );

    const instance = await getApiInstance(account.credentialsPath);
    if (!instance) {
      runtime.error(`[${account.accountId}] zalozcajs: failed to get API instance`);
      if (!stopped && !abortSignal.aborted) {
        restartTimer = setTimeout(startListenerLoop, 5000);
      }
      return;
    }

    listenerHandle = startListener(
      instance,
      (msg) => {
        // Skip self messages
        if (msg.isSelf) {
          return;
        }
        logVerbose(core, runtime, `[${account.accountId}] inbound message`);
        statusSink?.({ lastInboundAt: Date.now() });
        processMessage(msg, account, config, core, runtime, statusSink).catch((err) => {
          runtime.error(`[${account.accountId}] Failed to process message: ${String(err)}`);
        });
      },
      (err) => {
        runtime.error(`[${account.accountId}] zca-js listener error: ${String(err)}`);
        if (!stopped && !abortSignal.aborted) {
          logVerbose(core, runtime, `[${account.accountId}] restarting listener in 5s...`);
          restartTimer = setTimeout(startListenerLoop, 5000);
        } else {
          resolveRunning?.();
        }
      },
    );
  };

  // Create a promise that stays pending until abort or stop
  const runningPromise = new Promise<void>((resolve) => {
    resolveRunning = resolve;
    abortSignal.addEventListener("abort", () => resolve(), { once: true });
  });

  await startListenerLoop();

  // Watch for credentials file changes (external disconnect/reconnect via operis-api)
  let credentialsRemoved = false;
  credentialsWatcher = setInterval(() => {
    const exists = existsSync(account.credentialsPath);
    if (!exists && !credentialsRemoved) {
      // Credentials removed — tear down listener but stay alive to detect re-creation
      credentialsRemoved = true;
      runtime.log?.(`[${account.accountId}] credentials removed, stopping zalozcajs listener`);
      if (listenerHandle) {
        listenerHandle.stop();
        listenerHandle = null;
      }
      disconnectInstance(account.credentialsPath);
    } else if (exists && credentialsRemoved) {
      // Credentials re-created (e.g. operis-api reconnect) — restart listener
      credentialsRemoved = false;
      runtime.log?.(`[${account.accountId}] credentials restored, restarting zalozcajs listener`);
      if (!stopped && !abortSignal.aborted) {
        void startListenerLoop();
      }
    }
  }, 3_000);

  // Wait for the running promise to resolve (on abort/stop)
  await runningPromise;

  return { stop };
}
