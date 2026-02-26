import { getApiInstance, sendMessage as zcajsSendMessage } from "./zcajs-client.js";

export type ZalozcajsSendOptions = {
  credentialsPath?: string;
  mediaUrl?: string;
  caption?: string;
  isGroup?: boolean;
};

export type ZalozcajsSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export async function sendMessageZalozcajs(
  threadId: string,
  text: string,
  options: ZalozcajsSendOptions = {},
): Promise<ZalozcajsSendResult> {
  const credentialsPath = options.credentialsPath || "default";

  if (!threadId?.trim()) {
    return { ok: false, error: "No threadId provided" };
  }

  const instance = await getApiInstance(credentialsPath);
  if (!instance) {
    return { ok: false, error: "Not authenticated. Run QR login first." };
  }

  // Handle media sending (text with URL for now, zca-js attachments need file paths)
  if (options.mediaUrl) {
    // Send the media URL as a text message with the caption
    const combined = options.caption
      ? `${options.caption}\n${options.mediaUrl}`
      : text
        ? `${text}\n${options.mediaUrl}`
        : options.mediaUrl;

    return zcajsSendMessage(
      instance,
      threadId.trim(),
      combined.slice(0, 2000),
      options.isGroup ?? false,
    );
  }

  // Send text message
  return zcajsSendMessage(instance, threadId.trim(), text.slice(0, 2000), options.isGroup ?? false);
}

function extractMessageId(stdout: string): string | undefined {
  const match = stdout.match(/message[_\s]?id[:\s]+(\S+)/i);
  if (match) {
    return match[1];
  }
  const firstWord = stdout.trim().split(/\s+/)[0];
  if (firstWord && /^[a-zA-Z0-9_-]+$/.test(firstWord)) {
    return firstWord;
  }
  return undefined;
}
