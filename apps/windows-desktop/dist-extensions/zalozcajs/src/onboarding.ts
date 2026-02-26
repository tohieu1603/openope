import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  promptAccountId,
  promptChannelAccessConfig,
} from "openclaw/plugin-sdk";
import type { ZcaJsFriend, ZcaJsGroup } from "./types.js";
import {
  listZalozcajsAccountIds,
  resolveDefaultZalozcajsAccountId,
  resolveZalozcajsAccountSync,
  checkZcaJsAuthenticated,
} from "./accounts.js";
import {
  loginWithQR,
  getApiInstance,
  getAllFriends,
  getAllGroups,
  disconnectInstance,
} from "./zcajs-client.js";

const channel = "zalozcajs" as const;

function setZalozcajsDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): OpenClawConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.zalozcajs?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalozcajs: {
        ...cfg.channels?.zalozcajs,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  } as OpenClawConfig;
}

async function noteZalozcajsHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Zalo Personal Account login via zca-js (QR code).",
      "",
      "Prerequisites:",
      "1) npm install zca-js (included as dependency)",
      "2) You'll scan a QR code with your Zalo app",
      "",
      "Note: Only one web listener per account at a time.",
      "Opening Zalo in browser will stop the listener.",
    ].join("\n"),
    "Zalo Personal (zca-js) Setup",
  );
}

async function promptZalozcajsAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveZalozcajsAccountSync({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const parseInput = (raw: string) =>
    raw
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const resolveUserId = async (input: string): Promise<string | null> => {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    // Try to find via friends list
    const instance = await getApiInstance(resolved.credentialsPath);
    if (!instance) {
      return null;
    }
    const friends = await getAllFriends(instance);
    const match = friends.find((f) => f.displayName?.toLowerCase() === trimmed.toLowerCase());
    return match?.userId ? String(match.userId) : null;
  };

  while (true) {
    const entry = await prompter.text({
      message: "Zalozcajs allowFrom (username or user id)",
      placeholder: "Alice, 123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = parseInput(String(entry));
    const results = await Promise.all(parts.map((part) => resolveUserId(part)));
    const unresolved = parts.filter((_, idx) => !results[idx]);
    if (unresolved.length > 0) {
      await prompter.note(
        `Could not resolve: ${unresolved.join(", ")}. Use numeric user ids or ensure you are logged in.`,
        "Zalo Personal (zca-js) allowlist",
      );
      continue;
    }
    const merged = [
      ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
      ...(results.filter(Boolean) as string[]),
    ];
    const unique = [...new Set(merged)];
    if (accountId === DEFAULT_ACCOUNT_ID) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          zalozcajs: {
            ...cfg.channels?.zalozcajs,
            enabled: true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      } as OpenClawConfig;
    }

    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalozcajs: {
          ...cfg.channels?.zalozcajs,
          enabled: true,
          accounts: {
            ...cfg.channels?.zalozcajs?.accounts,
            [accountId]: {
              ...cfg.channels?.zalozcajs?.accounts?.[accountId],
              enabled: cfg.channels?.zalozcajs?.accounts?.[accountId]?.enabled ?? true,
              dmPolicy: "allowlist",
              allowFrom: unique,
            },
          },
        },
      },
    } as OpenClawConfig;
  }
}

function setZalozcajsGroupPolicy(
  cfg: OpenClawConfig,
  accountId: string,
  groupPolicy: "open" | "allowlist" | "disabled",
): OpenClawConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalozcajs: {
          ...cfg.channels?.zalozcajs,
          enabled: true,
          groupPolicy,
        },
      },
    } as OpenClawConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalozcajs: {
        ...cfg.channels?.zalozcajs,
        enabled: true,
        accounts: {
          ...cfg.channels?.zalozcajs?.accounts,
          [accountId]: {
            ...cfg.channels?.zalozcajs?.accounts?.[accountId],
            enabled: cfg.channels?.zalozcajs?.accounts?.[accountId]?.enabled ?? true,
            groupPolicy,
          },
        },
      },
    },
  } as OpenClawConfig;
}

function setZalozcajsGroupAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  groupKeys: string[],
): OpenClawConfig {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { allow: true }]));
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        zalozcajs: {
          ...cfg.channels?.zalozcajs,
          enabled: true,
          groups,
        },
      },
    } as OpenClawConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      zalozcajs: {
        ...cfg.channels?.zalozcajs,
        enabled: true,
        accounts: {
          ...cfg.channels?.zalozcajs?.accounts,
          [accountId]: {
            ...cfg.channels?.zalozcajs?.accounts?.[accountId],
            enabled: cfg.channels?.zalozcajs?.accounts?.[accountId]?.enabled ?? true,
            groups,
          },
        },
      },
    },
  } as OpenClawConfig;
}

async function resolveZalozcajsGroups(params: {
  cfg: OpenClawConfig;
  accountId: string;
  entries: string[];
}): Promise<Array<{ input: string; resolved: boolean; id?: string }>> {
  const account = resolveZalozcajsAccountSync({ cfg: params.cfg, accountId: params.accountId });
  const instance = await getApiInstance(account.credentialsPath);
  if (!instance) {
    throw new Error("Not authenticated");
  }
  const groups = await getAllGroups(instance);

  return params.entries.map((input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return { input, resolved: false };
    }
    if (/^\d+$/.test(trimmed)) {
      return { input, resolved: true, id: trimmed };
    }
    const match = groups.find((g) => g.name?.toLowerCase() === trimmed.toLowerCase());
    return match?.groupId
      ? { input, resolved: true, id: String(match.groupId) }
      : { input, resolved: false };
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Zalo Personal (zca-js)",
  channel,
  policyKey: "channels.zalozcajs.dmPolicy",
  allowFromKey: "channels.zalozcajs.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.zalozcajs?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setZalozcajsDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultZalozcajsAccountId(cfg);
    return promptZalozcajsAllowFrom({
      cfg: cfg,
      prompter,
      accountId: id,
    });
  },
};

export const zalozcajsOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const ids = listZalozcajsAccountIds(cfg);
    let configured = false;
    for (const accountId of ids) {
      const account = resolveZalozcajsAccountSync({ cfg: cfg, accountId });
      const isAuth = await checkZcaJsAuthenticated(account.credentialsPath);
      if (isAuth) {
        configured = true;
        break;
      }
    }
    return {
      channel,
      configured,
      statusLines: [`Zalo Personal (zca-js): ${configured ? "logged in" : "needs QR login"}`],
      selectionHint: configured ? "recommended · logged in" : "recommended · QR login",
      quickstartScore: configured ? 1 : 15,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const zcajsOverride = accountOverrides.zalozcajs?.trim();
    const defaultAccountId = resolveDefaultZalozcajsAccountId(cfg);
    let accountId = zcajsOverride ? normalizeAccountId(zcajsOverride) : defaultAccountId;

    if (shouldPromptAccountIds && !zcajsOverride) {
      accountId = await promptAccountId({
        cfg: cfg,
        prompter,
        label: "Zalo Personal (zca-js)",
        currentId: accountId,
        listAccountIds: listZalozcajsAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const account = resolveZalozcajsAccountSync({ cfg: next, accountId });
    const alreadyAuthenticated = await checkZcaJsAuthenticated(account.credentialsPath);

    if (!alreadyAuthenticated) {
      await noteZalozcajsHelp(prompter);

      const wantsLogin = await prompter.confirm({
        message: "Login via QR code now?",
        initialValue: true,
      });

      if (wantsLogin) {
        await prompter.note(
          "A QR code will appear in your terminal.\nScan it with your Zalo app to login.",
          "QR Login",
        );

        try {
          await loginWithQR(accountId === DEFAULT_ACCOUNT_ID ? "default" : accountId);
          const isNowAuth = await checkZcaJsAuthenticated(account.credentialsPath);
          if (isNowAuth) {
            await prompter.note("Login successful!", "Success");
          }
        } catch (err) {
          await prompter.note(
            `Login failed: ${err instanceof Error ? err.message : String(err)}`,
            "Error",
          );
        }
      }
    } else {
      const keepSession = await prompter.confirm({
        message: "Zalo Personal (zca-js) already logged in. Keep session?",
        initialValue: true,
      });
      if (!keepSession) {
        disconnectInstance(account.credentialsPath);
        try {
          await loginWithQR(accountId === DEFAULT_ACCOUNT_ID ? "default" : accountId);
        } catch (err) {
          await prompter.note(
            `Re-login failed: ${err instanceof Error ? err.message : String(err)}`,
            "Error",
          );
        }
      }
    }

    // Enable the channel
    if (accountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          zalozcajs: {
            ...next.channels?.zalozcajs,
            enabled: true,
          },
        },
      } as OpenClawConfig;
    } else {
      next = {
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
    }

    if (forceAllowFrom) {
      next = await promptZalozcajsAllowFrom({
        cfg: next,
        prompter,
        accountId,
      });
    }

    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Zalo groups",
      currentPolicy: account.config.groupPolicy ?? "open",
      currentEntries: Object.keys(account.config.groups ?? {}),
      placeholder: "Family, Work, 123456789",
      updatePrompt: Boolean(account.config.groups),
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setZalozcajsGroupPolicy(next, accountId, accessConfig.policy);
      } else {
        let keys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolved = await resolveZalozcajsGroups({
              cfg: next,
              accountId,
              entries: accessConfig.entries,
            });
            const resolvedIds = resolved
              .filter((entry) => entry.resolved && entry.id)
              .map((entry) => entry.id as string);
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            keys = [...resolvedIds, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            if (resolvedIds.length > 0 || unresolved.length > 0) {
              await prompter.note(
                [
                  resolvedIds.length > 0 ? `Resolved: ${resolvedIds.join(", ")}` : undefined,
                  unresolved.length > 0
                    ? `Unresolved (kept as typed): ${unresolved.join(", ")}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join("\n"),
                "Zalo groups",
              );
            }
          } catch (err) {
            await prompter.note(
              `Group lookup failed; keeping entries as typed. ${String(err)}`,
              "Zalo groups",
            );
          }
        }
        next = setZalozcajsGroupPolicy(next, accountId, "allowlist");
        next = setZalozcajsGroupAllowlist(next, accountId, keys);
      }
    }

    return { cfg: next, accountId };
  },
};
