/**
 * Chat API Service
 * Handles chat with Operis API
 */

import apiClient, { getAccessToken, getRefreshToken, setTokens, clearTokens, getErrorMessage } from "./api-client";
import { API_CONFIG } from "../config";

// Types matching Operis API response (Anthropic format)
export interface ContentBlock {
  type: "text" | "thinking";
  text?: string;
  thinking?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ChatResult {
  role: "assistant";
  content: ContentBlock[];
  model: string;
  provider: string;
  usage: TokenUsage;
  stopReason: string;
  conversationId: string;
  tokenBalance: number;
}

export interface ChatError {
  error: string;
  code?: string;
}

// Extract text content from response
export function extractTextContent(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

// Chat request options
export interface ChatOptions {
  model?: string;
  systemPrompt?: string;
  conversationId?: string;
}

// Send chat message (non-streaming)
export async function sendMessageSync(
  message: string,
  options?: ChatOptions,
): Promise<ChatResult> {
  try {
    const response = await apiClient.post<ChatResult>("/chat", {
      message,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      conversationId: options?.conversationId,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Internal function to refresh tokens (for SSE streaming)
async function refreshTokensForStream(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token");
  }

  const axios = (await import("axios")).default;
  const response = await axios.post(`${API_CONFIG.baseUrl}/auth/refresh`, {
    refreshToken,
  });

  setTokens(response.data.accessToken, response.data.refreshToken);
}

// Send chat message with SSE streaming
// Note: SSE streaming requires fetch, axios doesn't support it well
export async function sendMessage(
  message: string,
  conversationId?: string,
  onDelta?: (text: string) => void,
  onDone?: (result: ChatResult) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const url = `${API_CONFIG.baseUrl}/chat/stream`;

  // Helper to make the streaming request
  async function doStreamRequest(token: string | null): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, conversationId }),
      signal,
    });
  }

  let response = await doStreamRequest(getAccessToken());

  // Handle 401 - try to refresh token and retry once
  if (response.status === 401 && getRefreshToken()) {
    try {
      await refreshTokensForStream();
      response = await doStreamRequest(getAccessToken());
    } catch {
      clearTokens();
      window.dispatchEvent(new CustomEvent("auth:session-expired"));
      throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Request failed: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorMessage;
    } catch {
      // Keep default error message
    }
    throw new Error(errorMessage);
  }

  // Parse SSE stream with named events (event: xxx\ndata: {...})
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ChatResult | null = null;
  let accumulatedText = "";
  let currentEvent = "";
  let convId = conversationId || "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      // Parse event name
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      // Parse data
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const data = JSON.parse(jsonStr);

          // Handle based on event type from backend
          if (currentEvent === "meta" && data.conversationId) {
            convId = data.conversationId;
          } else if (currentEvent === "content" && data.content !== undefined) {
            // Backend sends full accumulated content in each chunk
            accumulatedText = data.content;
            onDelta?.(accumulatedText);
          } else if (currentEvent === "done") {
            // Normalize usage from backend (may be snake_case or camelCase)
            const raw = data.usage;
            const usage: TokenUsage = raw ? {
              input: raw.input ?? raw.input_tokens ?? 0,
              output: raw.output ?? raw.output_tokens ?? 0,
              cacheRead: raw.cacheRead ?? raw.cache_read_tokens ?? 0,
              cacheWrite: raw.cacheWrite ?? raw.cache_write_tokens ?? raw.cache_creation_input_tokens ?? 0,
              totalTokens: raw.totalTokens ?? raw.total_tokens ?? 0,
              cost: raw.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

            // Build final result from done event
            finalResult = {
              role: "assistant",
              content: [{ type: "text", text: accumulatedText }],
              model: "unknown",
              provider: "unknown",
              usage,
              stopReason: "end_turn",
              conversationId: data.conversationId || convId,
              tokenBalance: data.tokenBalance ?? data.token_balance ?? 0,
            };
            onDone?.(finalResult);
          } else if (currentEvent === "error") {
            // Mark as SSE error and throw
            const err = new Error(data.error || "Stream error");
            (err as Error & { isSSEError: boolean }).isSSEError = true;
            throw err;
          }

          // Reset event after processing
          currentEvent = "";
        } catch (e) {
          // Re-throw SSE errors from backend, skip malformed JSON parsing errors
          if (e instanceof Error && (e as Error & { isSSEError?: boolean }).isSSEError) {
            throw e;
          }
        }
      }
    }
  }

  // Return final result or construct one from accumulated text
  if (finalResult) return finalResult;

  return {
    role: "assistant",
    content: [{ type: "text", text: accumulatedText }],
    model: "unknown",
    provider: "unknown",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "end_turn",
    conversationId: convId,
    tokenBalance: 0,
  };
}

// Get token balance
export async function getChatBalance(): Promise<{ balance: number }> {
  try {
    const response = await apiClient.get<{ balance: number }>("/chat/balance");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Conversation types
export interface Conversation {
  conversation_id: string;
  last_message: string;
  created_at: string;
}

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// Get all conversations
export async function getConversations(): Promise<{ conversations: Conversation[] }> {
  try {
    const response = await apiClient.get<{ conversations: Conversation[] }>("/chat/conversations");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Conversation usage stats from API
export interface ConversationUsage {
  total_tokens: number;
  total_cost: number;
  message_count: number;
}

// Get conversation history
export async function getConversationHistory(conversationId: string): Promise<{ messages: HistoryMessage[]; usage?: ConversationUsage }> {
  try {
    const response = await apiClient.get<{ messages: HistoryMessage[]; usage?: ConversationUsage }>(`/chat/conversations/${conversationId}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Start new conversation
export async function newConversation(): Promise<{ conversationId: string }> {
  try {
    const response = await apiClient.post<{ conversationId: string }>("/chat/conversations/new");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Delete conversation
export async function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  try {
    const response = await apiClient.delete<{ success: boolean }>(`/chat/conversations/${conversationId}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
