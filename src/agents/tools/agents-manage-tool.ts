import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { listAgentIds } from "../agent-scope.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const DEFAULT_MAX_AGENTS = 10;

const AGENTS_MANAGE_ACTIONS = ["create", "update", "delete"] as const;

const AgentsManageToolSchema = Type.Object({
  action: stringEnum(AGENTS_MANAGE_ACTIONS),
  name: Type.Optional(Type.String({ description: "Agent display name (required for create)" })),
  workspace: Type.Optional(Type.String({ description: "Workspace directory path" })),
  emoji: Type.Optional(Type.String({ description: "Agent emoji (create only)" })),
  avatar: Type.Optional(Type.String({ description: "Avatar URL or path" })),
  agentId: Type.Optional(
    Type.String({ description: "Target agent ID (required for update/delete)" }),
  ),
  model: Type.Optional(Type.String({ description: "Model override (update only)" })),
  deleteFiles: Type.Optional(
    Type.Boolean({ description: "Delete workspace files on delete (default: true)" }),
  ),
});

export function createAgentsManageTool(opts?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  return {
    label: "Agents",
    name: "agents_manage",
    description:
      "Quản lý nhân viên/agent: tạo mới (create), cập nhật (update), xóa (delete). " +
      "Dùng tool này khi người dùng yêu cầu tạo nhân viên mới, thêm nhân viên mới, sửa thông tin nhân viên, hoặc xóa nhân viên. " +
      "Lưu ý: để giao việc cho nhân viên đã có, dùng sessions_spawn thay vì tool này.",
    parameters: AgentsManageToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {};

      if (action === "create") {
        const name = readStringParam(params, "name", { required: true, label: "name" });
        const cfg = opts?.config ?? loadConfig();
        const maxAgents = cfg.agents?.limits?.maxAgents ?? DEFAULT_MAX_AGENTS;
        const currentCount = listAgentIds(cfg).length;
        if (currentCount >= maxAgents) {
          return jsonResult({
            status: "error",
            error: `Đã đạt giới hạn tối đa ${maxAgents} nhân viên. Hãy xóa nhân viên không cần trước.`,
          });
        }

        const createParams: Record<string, unknown> = { name };
        const workspace = readStringParam(params, "workspace");
        const emoji = readStringParam(params, "emoji");
        const avatar = readStringParam(params, "avatar");
        if (workspace) createParams.workspace = workspace;
        if (emoji) createParams.emoji = emoji;
        if (avatar) createParams.avatar = avatar;

        const result = await callGatewayTool("agents.create", gatewayOpts, createParams);
        return jsonResult(result);
      }

      if (action === "update") {
        const agentId = readStringParam(params, "agentId", { required: true, label: "agentId" });
        const updateParams: Record<string, unknown> = { agentId };
        const name = readStringParam(params, "name");
        const workspace = readStringParam(params, "workspace");
        const model = readStringParam(params, "model");
        const avatar = readStringParam(params, "avatar");
        if (name) updateParams.name = name;
        if (workspace) updateParams.workspace = workspace;
        if (model) updateParams.model = model;
        if (avatar) updateParams.avatar = avatar;

        const result = await callGatewayTool("agents.update", gatewayOpts, updateParams);
        return jsonResult(result);
      }

      if (action === "delete") {
        const agentId = readStringParam(params, "agentId", { required: true, label: "agentId" });
        const deleteFiles = typeof params.deleteFiles === "boolean" ? params.deleteFiles : true;
        const result = await callGatewayTool("agents.delete", gatewayOpts, {
          agentId,
          deleteFiles,
        });
        return jsonResult(result);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
