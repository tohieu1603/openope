// Agent types for Client Web
// Based on moltbot gateway types

// === Agents ===
export type AgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
};

export type Agent = {
  id: string;
  name?: string;
  identity?: AgentIdentity;
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: Agent[];
};

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

// === Skills ===
export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled?: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

// === Nodes ===
export type NodeInfo = {
  nodeId: string;
  displayName?: string;
  remoteIp?: string;
  version?: string;
  connected: boolean;
  paired: boolean;
  caps?: string[];
  commands?: string[];
};

export type DeviceTokenSummary = {
  role: string;
  scopes?: string[];
  createdAtMs?: number;
  rotatedAtMs?: number;
  revokedAtMs?: number;
  lastUsedAtMs?: number;
};

export type PendingDevice = {
  requestId: string;
  deviceId: string;
  displayName?: string;
  role?: string;
  remoteIp?: string;
  isRepair?: boolean;
  ts?: number;
};

export type PairedDevice = {
  deviceId: string;
  displayName?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  tokens?: DeviceTokenSummary[];
  createdAtMs?: number;
  approvedAtMs?: number;
};

export type DevicePairingList = {
  pending: PendingDevice[];
  paired: PairedDevice[];
};

// === Channels ===
export type ChannelEntry = {
  id: string;
  label?: string;
  connected: boolean;
  enabled: boolean;
};

export type ChannelsStatusSnapshot = {
  channels: ChannelEntry[];
};

// === Cron ===
export type CronJob = {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  schedule: string;
  sessionTarget: string;
  enabled: boolean;
  state?: string;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number;
};
