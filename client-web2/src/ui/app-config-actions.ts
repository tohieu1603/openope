import type { NodeInfo, DevicePairingList, PendingDevice, PairedDevice } from "./agent-types";
/**
 * Config / Nodes / Devices / Exec Approvals domain action functions.
 */
import { showToast } from "./components/operis-toast";
import { waitForConnection } from "./gateway-client";

export interface ConfigHost {
  // Nodes
  nodesLoading: boolean;
  nodesList: NodeInfo[];

  // Devices
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;

  // Config (for bindings)
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  configSnapshot: { hash: string; config: Record<string, unknown> } | null;

  // Exec approvals
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: import("./agent-types").ExecApprovalsSnapshot | null;
  execApprovalsForm: import("./agent-types").ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
}

export async function loadNodes(host: ConfigHost) {
  host.nodesLoading = true;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ nodes?: NodeInfo[] }>("node.list", {});
    host.nodesList = Array.isArray(res?.nodes) ? res.nodes : [];
  } catch (err) {
    console.error("Failed to load nodes:", err);
  } finally {
    host.nodesLoading = false;
  }
}

export async function loadDevices(host: ConfigHost) {
  host.devicesLoading = true;
  host.devicesError = null;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ pending?: PendingDevice[]; paired?: PairedDevice[] }>(
      "device.pair.list",
      {},
    );
    host.devicesList = {
      pending: Array.isArray(res?.pending) ? res.pending : [],
      paired: Array.isArray(res?.paired) ? res.paired : [],
    };
  } catch (err) {
    host.devicesError = err instanceof Error ? err.message : "Không thể tải thiết bị";
  } finally {
    host.devicesLoading = false;
  }
}

export async function handleDeviceApprove(host: ConfigHost, requestId: string) {
  try {
    const client = await waitForConnection();
    await client.request("device.pair.approve", { requestId });
    showToast("Đã chấp nhận thiết bị", "success");
    await loadDevices(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi", "error");
  }
}

export async function handleDeviceReject(host: ConfigHost, requestId: string) {
  try {
    const client = await waitForConnection();
    await client.request("device.pair.reject", { requestId });
    showToast("Đã từ chối thiết bị", "success");
    await loadDevices(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi", "error");
  }
}

export async function handleDeviceRotate(
  host: ConfigHost,
  deviceId: string,
  role: string,
  scopes?: string[],
) {
  try {
    const client = await waitForConnection();
    await client.request("device.token.rotate", { deviceId, role, scopes });
    showToast("Đã rotate token", "success");
    await loadDevices(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi", "error");
  }
}

export async function handleDeviceRevoke(host: ConfigHost, deviceId: string, role: string) {
  try {
    const client = await waitForConnection();
    await client.request("device.token.revoke", { deviceId, role });
    showToast("Đã revoke token", "success");
    await loadDevices(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi", "error");
  }
}

export async function loadConfig(host: ConfigHost) {
  host.configLoading = true;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ config: Record<string, unknown>; hash: string }>(
      "config.get",
      {},
    );
    if (res?.config) {
      host.configSnapshot = { config: res.config, hash: res.hash ?? "" };
      host.configForm = JSON.parse(JSON.stringify(res.config));
      host.configDirty = false;
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi load config", "error");
  } finally {
    host.configLoading = false;
  }
}

export function handleBindDefault(host: ConfigHost, nodeId: string | null) {
  if (!host.configForm) return;
  const form = JSON.parse(JSON.stringify(host.configForm));
  if (!form.tools) form.tools = {};
  if (!form.tools.exec) form.tools.exec = {};
  if (nodeId) {
    form.tools.exec.node = nodeId;
  } else {
    delete form.tools.exec.node;
  }
  host.configForm = form;
  host.configDirty = true;
}

export function handleBindAgent(host: ConfigHost, agentIndex: number, nodeId: string | null) {
  if (!host.configForm) return;
  const form = JSON.parse(JSON.stringify(host.configForm));
  if (!form.agents?.list?.[agentIndex]) return;
  const agent = form.agents.list[agentIndex];
  if (!agent.tools) agent.tools = {};
  if (!agent.tools.exec) agent.tools.exec = {};
  if (nodeId) {
    agent.tools.exec.node = nodeId;
  } else {
    delete agent.tools.exec.node;
  }
  host.configForm = form;
  host.configDirty = true;
}

export async function handleSaveBindings(host: ConfigHost) {
  if (!host.configForm || !host.configSnapshot) return;
  host.configSaving = true;
  try {
    const client = await waitForConnection();
    await client.request("config.set", {
      config: host.configForm,
      baseHash: host.configSnapshot.hash,
    });
    showToast("Đã lưu bindings", "success");
    host.configDirty = false;
    await loadConfig(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi lưu bindings", "error");
  } finally {
    host.configSaving = false;
  }
}

export async function loadExecApprovals(host: ConfigHost) {
  host.execApprovalsLoading = true;
  try {
    const client = await waitForConnection();
    const target = host.execApprovalsTarget;
    const nodeId = host.execApprovalsTargetNodeId;
    const params: Record<string, unknown> = {};
    if (target === "node" && nodeId) {
      params.nodeId = nodeId;
    }
    const method = target === "node" ? "exec.approvals.node.get" : "exec.approvals.get";
    const res = await client.request<import("./agent-types").ExecApprovalsSnapshot>(method, params);
    host.execApprovalsSnapshot = res;
    if (!host.execApprovalsDirty) {
      host.execApprovalsForm = res?.file ? JSON.parse(JSON.stringify(res.file)) : null;
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi load exec approvals", "error");
  } finally {
    host.execApprovalsLoading = false;
  }
}

export function handleExecApprovalsTargetChange(
  host: ConfigHost,
  kind: "gateway" | "node",
  nodeId: string | null,
) {
  host.execApprovalsTarget = kind;
  host.execApprovalsTargetNodeId = nodeId;
  host.execApprovalsSnapshot = null;
  host.execApprovalsForm = null;
  host.execApprovalsDirty = false;
}

export function handleExecApprovalsSelectAgent(host: ConfigHost, agentId: string) {
  host.execApprovalsSelectedAgent = agentId;
}

export function handleExecApprovalsPatch(
  host: ConfigHost,
  path: Array<string | number>,
  value: unknown,
) {
  const form = host.execApprovalsForm ?? host.execApprovalsSnapshot?.file ?? {};
  const updated = JSON.parse(JSON.stringify(form));
  let current: any = updated;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = typeof path[i + 1] === "number" ? [] : {};
    }
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  current[lastKey] = value;
  host.execApprovalsForm = updated;
  host.execApprovalsDirty = true;
}

export function handleExecApprovalsRemove(host: ConfigHost, path: Array<string | number>) {
  const form = host.execApprovalsForm ?? host.execApprovalsSnapshot?.file ?? {};
  const updated = JSON.parse(JSON.stringify(form));
  let current: any = updated;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) return;
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    current.splice(Number(lastKey), 1);
  } else {
    delete current[lastKey];
  }
  host.execApprovalsForm = updated;
  host.execApprovalsDirty = true;
}

export async function handleSaveExecApprovals(host: ConfigHost) {
  if (!host.execApprovalsForm || !host.execApprovalsSnapshot) return;
  host.execApprovalsSaving = true;
  try {
    const client = await waitForConnection();
    const target = host.execApprovalsTarget;
    const nodeId = host.execApprovalsTargetNodeId;
    const params: Record<string, unknown> = {
      file: host.execApprovalsForm,
      baseHash: host.execApprovalsSnapshot.hash,
    };
    if (target === "node" && nodeId) {
      params.nodeId = nodeId;
    }
    const method = target === "node" ? "exec.approvals.node.set" : "exec.approvals.set";
    await client.request(method, params);
    showToast("Đã lưu exec approvals", "success");
    host.execApprovalsDirty = false;
    await loadExecApprovals(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Lỗi lưu exec approvals", "error");
  } finally {
    host.execApprovalsSaving = false;
  }
}
