/**
 * Test: Tool calling qua operis-anthropic proxy
 * Intercept fetch để xem SDK gửi gì và nhận gì
 */
import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";

const PROXY_BASE_URL = "http://127.0.0.1:3025/v1/anthropic";
const PROXY_API_KEY = "sk_test_anthropic_proxy_2026";

// Monkey-patch fetch to log requests/responses
const originalFetch = globalThis.fetch;
globalThis.fetch = async function patchedFetch(input: any, init?: any) {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  console.log(`\n[FETCH] ${init?.method ?? "GET"} ${url}`);

  // Log headers
  const headers = init?.headers ?? {};
  const headerEntries =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : typeof headers === "object"
        ? headers
        : {};
  for (const [key, value] of Object.entries(headerEntries)) {
    console.log(`  [H] ${key}: ${String(value).slice(0, 100)}`);
  }

  // Log body (check for tools)
  if (init?.body) {
    const bodyStr = typeof init.body === "string" ? init.body : "";
    if (bodyStr) {
      try {
        const parsed = JSON.parse(bodyStr);
        console.log(`  [BODY] model=${parsed.model} stream=${parsed.stream}`);
        console.log(
          `  [BODY] messages=${parsed.messages?.length} tools=${parsed.tools?.length ?? 0}`,
        );
        if (parsed.tools?.length) {
          console.log(
            `  [TOOLS] ${parsed.tools.map((t: any) => t.function?.name ?? t.name).join(", ")}`,
          );
        }
      } catch {
        console.log(`  [BODY] ${bodyStr.slice(0, 200)}`);
      }
    }
  }

  const res = await originalFetch(input, init);

  // Clone response to log it
  const clone = res.clone();
  if (!clone.headers.get("content-type")?.includes("event-stream")) {
    try {
      const text = await clone.text();
      console.log(`  [RESP ${res.status}] ${text.slice(0, 300)}`);
    } catch {}
  } else {
    console.log(`  [RESP ${res.status}] (streaming)`);
  }

  return res;
};

async function main() {
  console.log("=== Test Tool Calling via Proxy ===\n");

  // Build a fake model that points to our proxy
  const model: Model<Api> = {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    api: "openai-completions",
    provider: "operis-anthropic",
    baseUrl: PROXY_BASE_URL,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16384,
  } as Model<Api>;

  console.log(`Provider: ${model.provider}`);
  console.log(`API: ${model.api}`);
  console.log(`BaseUrl: ${model.baseUrl}`);
  console.log(`API Key: ${PROXY_API_KEY.slice(0, 20)}...`);

  try {
    const res = await completeSimple(
      model,
      {
        messages: [{ role: "user", content: "Mo youtube", timestamp: Date.now() }],
      },
      { apiKey: PROXY_API_KEY, maxTokens: 200, temperature: 0 },
    );

    console.log("\n=== RESPONSE ===");
    console.log("Stop reason:", res.stopReason);
    for (const block of res.content) {
      if (block.type === "text") {
        console.log(`[TEXT] ${block.text}`);
      } else if (block.type === "toolCall") {
        console.log(`[TOOL_CALL] ${(block as any).name}(${JSON.stringify((block as any).input)})`);
      } else {
        console.log(`[${block.type}]`, JSON.stringify(block).slice(0, 200));
      }
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  }

  globalThis.fetch = originalFetch;
}

main();
