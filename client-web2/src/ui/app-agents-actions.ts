import type {
  AgentsListResult,
  AgentFileEntry,
  AgentsFilesListResult,
  AgentIdentityResult,
  SkillStatusReport,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
} from "./agent-types";
/**
 * Agents domain action functions.
 */
import { showToast } from "./components/operis-toast";
import { waitForConnection } from "./gateway-client";

export interface AgentsHost {
  // Agents list
  agentsLoading: boolean;
  agentsError: string | null;
  agentsList: AgentsListResult | null;
  agentSelectedId: string | null;
  agentActivePanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron";

  // Config
  agentConfigForm: Record<string, unknown> | null;
  agentConfigBaseHash: string | null;
  agentConfigLoading: boolean;
  agentConfigSaving: boolean;
  agentConfigDirty: boolean;

  // Files
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;

  // Identity
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;

  // Channels
  agentChannelsLoading: boolean;
  agentChannelsError: string | null;
  agentChannelsSnapshot: ChannelsStatusSnapshot | null;
  agentChannelsLastSuccess: number | null;

  // Cron
  agentCronLoading: boolean;
  agentCronError: string | null;
  agentCronStatus: CronStatus | null;
  agentCronJobs: CronJob[];

  // Skills (per-agent)
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  agentSkillsFilter: string;

  // Global skills tab
  skillsLoading: boolean;
  skillsError: string | null;
  skillsReport: SkillStatusReport | null;
  skillsFilter: string;
  skillsEdits: Record<string, string>;
  skillsBusyKey: string | null;
  skillsMessages: Record<string, { kind: string; message: string }>;
}

export async function loadAgents(host: AgentsHost) {
  host.agentsLoading = true;
  host.agentsError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<AgentsListResult>("agents.list", {});
    if (res) {
      host.agentsList = res;
      const known = res.agents.some((a) => a.id === host.agentSelectedId);
      if (!host.agentSelectedId || !known) {
        host.agentSelectedId = res.defaultId ?? res.agents[0]?.id ?? null;
      }
      if (host.agentSelectedId) {
        await loadAgentConfig(host);
        await loadAgentIdentity(host, host.agentSelectedId);
      }
    }
  } catch (err) {
    host.agentsError = err instanceof Error ? err.message : "Không thể tải nhân viên";
  } finally {
    host.agentsLoading = false;
  }
}

export function handleSelectAgent(host: AgentsHost, agentId: string) {
  if (host.agentSelectedId === agentId) return;
  host.agentSelectedId = agentId;
  host.agentActivePanel = "overview";
  // Reset agent-specific state
  host.agentFilesList = null;
  host.agentFilesError = null;
  host.agentFileActive = null;
  host.agentFileContents = {};
  host.agentFileDrafts = {};
  host.agentChannelsSnapshot = null;
  host.agentChannelsLastSuccess = null;
  host.agentCronStatus = null;
  host.agentCronJobs = [];
  host.agentSkillsReport = null;
  host.agentSkillsError = null;
  host.agentSkillsAgentId = null;
  host.agentSkillsFilter = "";
  // Auto-load config + identity
  loadAgentConfig(host);
  loadAgentIdentity(host, agentId);
}

export function handleSelectPanel(
  host: AgentsHost,
  panel: "overview" | "files" | "tools" | "skills" | "channels" | "cron",
) {
  host.agentActivePanel = panel;
  const agentId = host.agentSelectedId;
  if (!agentId) return;
  if (panel === "files" && host.agentFilesList?.agentId !== agentId) {
    loadAgentFiles(host, agentId);
  }
  if (panel === "channels" && !host.agentChannelsSnapshot) {
    loadAgentChannels(host);
  }
  if (panel === "cron" && !host.agentCronStatus) {
    loadAgentCron(host);
  }
  if (panel === "skills" && host.agentSkillsAgentId !== agentId) {
    loadAgentSkills(host, agentId);
  }
  if (panel === "overview" || panel === "tools") {
    if (!host.agentConfigForm) {
      loadAgentConfig(host);
    }
  }
}

export async function loadAgentFiles(host: AgentsHost, agentId: string) {
  host.agentFilesLoading = true;
  host.agentFilesError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<AgentsFilesListResult>("agents.files.list", { agentId });
    if (res) {
      host.agentFilesList = res;
      if (host.agentFileActive && !res.files.some((f) => f.name === host.agentFileActive)) {
        host.agentFileActive = null;
      }
    }
  } catch (err) {
    host.agentFilesError = err instanceof Error ? err.message : "Không thể tải files";
  } finally {
    host.agentFilesLoading = false;
  }
}

export async function handleSelectFile(host: AgentsHost, name: string) {
  host.agentFileActive = name;
  if (!host.agentSelectedId || host.agentFileContents[name] !== undefined) return;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ file?: AgentFileEntry }>("agents.files.get", {
      agentId: host.agentSelectedId,
      name,
    });
    if (res?.file) {
      const content = res.file.content ?? "";
      host.agentFileContents = { ...host.agentFileContents, [name]: content };
      host.agentFileDrafts = { ...host.agentFileDrafts, [name]: content };
    }
  } catch (err) {
    console.error("Failed to load file content:", err);
  }
}

export function handleFileDraftChange(host: AgentsHost, name: string, content: string) {
  host.agentFileDrafts = { ...host.agentFileDrafts, [name]: content };
}

export function handleFileReset(host: AgentsHost, name: string) {
  const base = host.agentFileContents[name] ?? "";
  host.agentFileDrafts = { ...host.agentFileDrafts, [name]: base };
}

export async function handleFileSave(host: AgentsHost, name: string) {
  if (!host.agentSelectedId) return;
  host.agentFileSaving = true;
  try {
    const client = await waitForConnection();
    const content = host.agentFileDrafts[name] ?? "";
    const res = await client.request<{ file?: AgentFileEntry }>("agents.files.set", {
      agentId: host.agentSelectedId,
      name,
      content,
    });
    if (res?.file) {
      host.agentFileContents = { ...host.agentFileContents, [name]: content };
      host.agentFileDrafts = { ...host.agentFileDrafts, [name]: content };
    }
    showToast("Đã lưu file", "success");
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Không thể lưu file", "error");
  } finally {
    host.agentFileSaving = false;
  }
}

export async function loadAgentConfig(host: AgentsHost) {
  if (!host.agentSelectedId) return;
  host.agentConfigLoading = true;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ config?: Record<string, unknown>; hash?: string }>(
      "config.get",
      {},
    );
    host.agentConfigForm = (res?.config as Record<string, unknown>) ?? {};
    host.agentConfigBaseHash = res?.hash ?? null;
    host.agentConfigDirty = false;
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Không thể tải config", "error");
  } finally {
    host.agentConfigLoading = false;
  }
}

export async function saveAgentConfig(host: AgentsHost) {
  if (!host.agentSelectedId) return;
  host.agentConfigSaving = true;
  try {
    const client = await waitForConnection();
    // Use config.patch with only the changed sections to avoid full-config validation issues
    const form = host.agentConfigForm ?? {};
    const patch: Record<string, unknown> = {};
    // Include sections that the agent settings UI can modify
    if (form.agents !== undefined) patch.agents = form.agents;
    if (form.primaryModel !== undefined) patch.primaryModel = form.primaryModel;
    if (form.modelFallbacks !== undefined) patch.modelFallbacks = form.modelFallbacks;
    const raw = JSON.stringify(patch);
    await client.request("config.patch", { raw, baseHash: host.agentConfigBaseHash });
    showToast("Đã lưu config", "success");
    host.agentConfigDirty = false;
    // Reload config to get fresh baseHash for next save
    const res = await client.request<{ config?: Record<string, unknown>; hash?: string }>(
      "config.get",
      {},
    );
    host.agentConfigForm = (res?.config as Record<string, unknown>) ?? {};
    host.agentConfigBaseHash = res?.hash ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Không thể lưu config";
    const details = (err as { details?: unknown })?.details;
    console.error("[config save]", msg, details ?? err);
    showToast(msg, "error");
  } finally {
    host.agentConfigSaving = false;
  }
}

export function handleAgentModelChange(host: AgentsHost, _agentId: string, modelId: string | null) {
  host.agentConfigForm = { ...host.agentConfigForm, primaryModel: modelId };
  host.agentConfigDirty = true;
}

export function handleAgentModelFallbacksChange(
  host: AgentsHost,
  _agentId: string,
  fallbacks: string[],
) {
  host.agentConfigForm = { ...host.agentConfigForm, modelFallbacks: fallbacks };
  host.agentConfigDirty = true;
}

export async function loadAgentChannels(host: AgentsHost) {
  host.agentChannelsLoading = true;
  host.agentChannelsError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<ChannelsStatusSnapshot>("channels.status", {
      probe: true,
      timeoutMs: 8000,
    });
    host.agentChannelsSnapshot = res ?? {};
    host.agentChannelsLastSuccess = Date.now();
  } catch (err) {
    host.agentChannelsError = err instanceof Error ? err.message : "Không thể tải channels";
  } finally {
    host.agentChannelsLoading = false;
  }
}

// --- Agent-Channel Bindings ---

export type AgentBinding = {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: "dm" | "group" | "channel"; id: string };
    guildId?: string;
    teamId?: string;
  };
};

/** Extract current bindings from loaded config. */
export function getBindingsFromConfig(configForm: Record<string, unknown> | null): AgentBinding[] {
  if (!configForm) return [];
  const bindings = configForm.bindings;
  return Array.isArray(bindings) ? (bindings as AgentBinding[]) : [];
}

/** Get bindings filtered by agent ID. */
export function getAgentBindings(
  configForm: Record<string, unknown> | null,
  agentId: string,
): AgentBinding[] {
  return getBindingsFromConfig(configForm).filter(
    (b) => b.agentId?.toLowerCase() === agentId.toLowerCase(),
  );
}

/** Add a binding for an agent to a channel and save via config.patch. */
export async function handleAddBinding(
  host: AgentsHost,
  agentId: string,
  channelId: string,
  accountId?: string,
) {
  if (!host.agentConfigForm) {
    showToast("Config chưa được tải", "error");
    return;
  }
  const existing = getBindingsFromConfig(host.agentConfigForm);
  // Check for duplicate
  const isDuplicate = existing.some(
    (b) =>
      b.agentId?.toLowerCase() === agentId.toLowerCase() &&
      b.match.channel?.toLowerCase() === channelId.toLowerCase() &&
      (b.match.accountId ?? "") === (accountId ?? ""),
  );
  if (isDuplicate) {
    showToast("Binding đã tồn tại", "error");
    return;
  }
  const match: AgentBinding["match"] = { channel: channelId };
  if (accountId) match.accountId = accountId;
  const newBindings = [...existing, { agentId, match }];
  host.agentConfigForm = { ...host.agentConfigForm, bindings: newBindings };
  host.agentConfigDirty = true;
}

/** Remove a binding by index and save. */
export function handleRemoveBinding(host: AgentsHost, bindingIndex: number) {
  if (!host.agentConfigForm) return;
  const existing = getBindingsFromConfig(host.agentConfigForm);
  if (bindingIndex < 0 || bindingIndex >= existing.length) return;
  const newBindings = existing.filter((_, i) => i !== bindingIndex);
  host.agentConfigForm = { ...host.agentConfigForm, bindings: newBindings };
  host.agentConfigDirty = true;
}

export async function loadAgentIdentity(host: AgentsHost, agentId: string) {
  host.agentIdentityLoading = true;
  host.agentIdentityError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<AgentIdentityResult>("agent.identity.get", { agentId });
    if (res) {
      host.agentIdentityById = { ...host.agentIdentityById, [agentId]: res };
    }
  } catch (err) {
    host.agentIdentityError = err instanceof Error ? err.message : "Không thể tải identity";
  } finally {
    host.agentIdentityLoading = false;
  }
}

export async function loadAgentSkills(host: AgentsHost, agentId: string) {
  if (host.agentSkillsLoading) return;
  host.agentSkillsLoading = true;
  host.agentSkillsError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<SkillStatusReport>("skills.status", { agentId });
    if (res) {
      host.agentSkillsReport = res;
      host.agentSkillsAgentId = agentId;
    }
  } catch (err) {
    host.agentSkillsError = err instanceof Error ? err.message : "Không thể tải kĩ năng";
  } finally {
    host.agentSkillsLoading = false;
  }
}

export function handleToolsProfileChange(
  host: AgentsHost,
  agentId: string,
  profile: string | null,
  clearAllow: boolean,
) {
  if (!host.agentConfigForm) return;
  const config = { ...host.agentConfigForm };
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex(
    (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
  );
  if (index < 0) return;
  const entry = { ...(list[index] as Record<string, unknown>) };
  const tools = { ...((entry.tools as Record<string, unknown>) ?? {}) };
  if (profile) {
    tools.profile = profile;
  } else {
    delete tools.profile;
  }
  if (clearAllow) {
    delete tools.allow;
  }
  entry.tools = tools;
  list[index] = entry;
  config.agents = { ...agents, list };
  host.agentConfigForm = config;
  host.agentConfigDirty = true;
}

export function handleToolsOverridesChange(
  host: AgentsHost,
  agentId: string,
  alsoAllow: string[],
  deny: string[],
) {
  if (!host.agentConfigForm) return;
  const config = { ...host.agentConfigForm };
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex(
    (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
  );
  if (index < 0) return;
  const entry = { ...(list[index] as Record<string, unknown>) };
  const tools = { ...((entry.tools as Record<string, unknown>) ?? {}) };
  if (alsoAllow.length > 0) {
    tools.alsoAllow = alsoAllow;
  } else {
    delete tools.alsoAllow;
  }
  if (deny.length > 0) {
    tools.deny = deny;
  } else {
    delete tools.deny;
  }
  entry.tools = tools;
  list[index] = entry;
  config.agents = { ...agents, list };
  host.agentConfigForm = config;
  host.agentConfigDirty = true;
}

export function handleAgentSkillToggle(
  host: AgentsHost,
  agentId: string,
  skillName: string,
  enabled: boolean,
) {
  if (!host.agentConfigForm) return;
  const config = { ...host.agentConfigForm };
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex(
    (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
  );
  if (index < 0) return;
  const entry = { ...(list[index] as Record<string, unknown>) };
  const normalizedSkill = skillName.trim();
  if (!normalizedSkill) return;
  const allSkills = host.agentSkillsReport?.skills?.map((s) => s.name).filter(Boolean) ?? [];
  const existing = Array.isArray(entry.skills)
    ? (entry.skills as string[]).map((n) => String(n).trim()).filter(Boolean)
    : undefined;
  const base = existing ?? allSkills;
  const next = new Set(base);
  if (enabled) {
    next.add(normalizedSkill);
  } else {
    next.delete(normalizedSkill);
  }
  entry.skills = [...next];
  list[index] = entry;
  config.agents = { ...agents, list };
  host.agentConfigForm = config;
  host.agentConfigDirty = true;
}

export function handleAgentSkillsClear(host: AgentsHost, agentId: string) {
  if (!host.agentConfigForm) return;
  const config = { ...host.agentConfigForm };
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex(
    (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
  );
  if (index < 0) return;
  const entry = { ...(list[index] as Record<string, unknown>) };
  delete entry.skills;
  list[index] = entry;
  config.agents = { ...agents, list };
  host.agentConfigForm = config;
  host.agentConfigDirty = true;
}

export function handleAgentSkillsDisableAll(host: AgentsHost, agentId: string) {
  if (!host.agentConfigForm) return;
  const config = { ...host.agentConfigForm };
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex(
    (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
  );
  if (index < 0) return;
  const entry = { ...(list[index] as Record<string, unknown>) };
  entry.skills = [];
  list[index] = entry;
  config.agents = { ...agents, list };
  host.agentConfigForm = config;
  host.agentConfigDirty = true;
}

export async function loadAgentCron(host: AgentsHost) {
  host.agentCronLoading = true;
  host.agentCronError = null;
  try {
    const client = await waitForConnection();
    const [statusRes, listRes] = await Promise.all([
      client.request<CronStatus>("cron.status", {}),
      client.request<{ jobs?: CronJob[] }>("cron.list", { includeDisabled: true }),
    ]);
    host.agentCronStatus = statusRes ?? { enabled: false, jobs: 0 };
    host.agentCronJobs = Array.isArray(listRes?.jobs) ? listRes.jobs : [];
  } catch (err) {
    host.agentCronError = err instanceof Error ? err.message : "Không thể tải cron jobs";
  } finally {
    host.agentCronLoading = false;
  }
}

// --- Global skills tab ---

export async function loadSkills(host: AgentsHost) {
  host.skillsLoading = true;
  host.skillsError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<SkillStatusReport>("skills.status", {});
    if (res) host.skillsReport = res;
  } catch (err) {
    host.skillsError = err instanceof Error ? err.message : "Không thể tải skills";
  } finally {
    host.skillsLoading = false;
  }
}

export async function handleSkillToggle(
  host: AgentsHost,
  skillKey: string,
  currentDisabled: boolean,
) {
  host.skillsBusyKey = skillKey;
  try {
    const client = await waitForConnection();
    const enabled = currentDisabled; // if currently disabled, enable it
    await client.request("skills.update", { skillKey, enabled });
    showToast(enabled ? "Đã bật skill" : "Đã tắt skill", "success");
    await loadSkills(host);
  } catch (err) {
    host.skillsMessages = {
      ...host.skillsMessages,
      [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi" },
    };
  } finally {
    host.skillsBusyKey = null;
  }
}

export function handleSkillEdit(host: AgentsHost, skillKey: string, value: string) {
  host.skillsEdits = { ...host.skillsEdits, [skillKey]: value };
}

export async function handleSkillSaveKey(host: AgentsHost, skillKey: string) {
  host.skillsBusyKey = skillKey;
  try {
    const client = await waitForConnection();
    const apiKey = host.skillsEdits[skillKey] ?? "";
    await client.request("skills.update", { skillKey, apiKey });
    showToast("Đã lưu API key", "success");
    host.skillsMessages = {
      ...host.skillsMessages,
      [skillKey]: { kind: "success", message: "Đã lưu" },
    };
    await loadSkills(host);
  } catch (err) {
    host.skillsMessages = {
      ...host.skillsMessages,
      [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi" },
    };
  } finally {
    host.skillsBusyKey = null;
  }
}

export async function handleSkillInstall(
  host: AgentsHost,
  skillKey: string,
  name: string,
  installId: string,
) {
  host.skillsBusyKey = skillKey;
  try {
    const client = await waitForConnection();
    showToast(`Đang cài đặt ${name}...`, "info");
    const res = await client.request<{ message?: string }>("skills.install", {
      name,
      installId,
      timeoutMs: 120_000,
    });
    await loadSkills(host);
    host.skillsMessages = {
      ...host.skillsMessages,
      [skillKey]: { kind: "success", message: res?.message ?? "Đã cài đặt" },
    };
  } catch (err) {
    host.skillsMessages = {
      ...host.skillsMessages,
      [skillKey]: { kind: "error", message: err instanceof Error ? err.message : "Lỗi cài đặt" },
    };
  } finally {
    host.skillsBusyKey = null;
  }
}
