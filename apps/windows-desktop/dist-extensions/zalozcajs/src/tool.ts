import { Type } from "@sinclair/typebox";
import {
  getApiInstance,
  sendMessage,
  getSelfInfo,
  getAllFriends,
  getAllGroups,
} from "./zcajs-client.js";
import { resolveCredentialsPath } from "./zcajs-client.js";

const ACTIONS = ["send", "friends", "groups", "me", "status"] as const;

function stringEnum<T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

// Tool schema - avoiding Type.Union per tool schema guardrails
export const ZalozcajsToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, { description: `Action to perform: ${ACTIONS.join(", ")}` }),
    threadId: Type.Optional(Type.String({ description: "Thread ID for messaging" })),
    message: Type.Optional(Type.String({ description: "Message text" })),
    isGroup: Type.Optional(Type.Boolean({ description: "Is group chat" })),
    accountId: Type.Optional(Type.String({ description: "Account ID" })),
    query: Type.Optional(Type.String({ description: "Search query" })),
  },
  { additionalProperties: false },
);

type ToolParams = {
  action: (typeof ACTIONS)[number];
  threadId?: string;
  message?: string;
  isGroup?: boolean;
  accountId?: string;
  query?: string;
};

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details: unknown;
};

function json(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export async function executeZalozcajsTool(
  _toolCallId: string,
  params: ToolParams,
): Promise<ToolResult> {
  try {
    const credentialsPath = resolveCredentialsPath(params.accountId || "default");
    const instance = await getApiInstance(credentialsPath);
    if (!instance) {
      throw new Error("Not authenticated. Run QR login first.");
    }

    switch (params.action) {
      case "send": {
        if (!params.threadId || !params.message) {
          throw new Error("threadId and message required for send action");
        }
        const result = await sendMessage(
          instance,
          params.threadId,
          params.message,
          params.isGroup ?? false,
        );
        if (!result.ok) {
          throw new Error(result.error || "Failed to send message");
        }
        return json({ success: true, messageId: result.messageId });
      }

      case "friends": {
        const friends = await getAllFriends(instance);
        let filtered = friends;
        if (params.query?.trim()) {
          const q = params.query.trim().toLowerCase();
          filtered = friends.filter(
            (f) => f.displayName?.toLowerCase().includes(q) || f.userId?.includes(q),
          );
        }
        return json(filtered);
      }

      case "groups": {
        const groups = await getAllGroups(instance);
        return json(groups);
      }

      case "me": {
        const info = await getSelfInfo(instance);
        if (!info) {
          throw new Error("Failed to get profile");
        }
        return json(info);
      }

      case "status": {
        return json({
          authenticated: true,
          message: "Connected via zca-js",
        });
      }

      default: {
        params.action satisfies never;
        throw new Error(
          `Unknown action: ${String(params.action)}. Valid actions: send, friends, groups, me, status`,
        );
      }
    }
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
