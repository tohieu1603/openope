/**
 * Test: Extract session key từ setup token
 * Mục tiêu: lấy session key thật mà SDK dùng để gọi Anthropic
 * → dùng session key đó gọi curl trực tiếp
 */
import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import path from "node:path";

const SETUP_TOKEN =
  "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";

const AGENT_DIR = path.join(process.env.HOME ?? "/Users/admin", ".openclaw/agents/main/agent");

// Monkey-patch global fetch to intercept the real API call
const originalFetch = globalThis.fetch;
globalThis.fetch = async function patchedFetch(input: any, init?: any) {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const headers = init?.headers ?? {};

  // Log every outbound request
  console.log(`\n[INTERCEPT] ${init?.method ?? "GET"} ${url}`);

  // Extract auth headers
  const headerEntries =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : typeof headers === "object"
        ? headers
        : {};

  for (const [key, value] of Object.entries(headerEntries)) {
    const v = String(value);
    console.log(`  [HEADER] ${key}: ${v.slice(0, 80)}${v.length > 80 ? "..." : ""}`);
  }

  // Log body snippet
  if (init?.body) {
    const bodyStr = typeof init.body === "string" ? init.body : "";
    if (bodyStr) {
      console.log(`  [BODY] ${bodyStr.slice(0, 200)}...`);
    }
  }

  // Call original fetch
  return originalFetch(input, init);
};

async function main() {
  console.log("=== Extract Session Key from Setup Token ===\n");

  const authStorage = new AuthStorage(path.join(AGENT_DIR, "auth.json"));
  const modelRegistry = new ModelRegistry(authStorage, path.join(AGENT_DIR, "models.json"));
  const allModels = modelRegistry.getAll() as Array<Model<Api>>;
  const model = allModels.find((m) => m.provider === "anthropic" && m.id === "claude-sonnet-4-5");

  if (!model) {
    console.error("Model not found!");
    process.exit(1);
  }

  console.log(`Model: ${model.provider}/${model.id}`);
  console.log(`Setup token: ${SETUP_TOKEN.slice(0, 20)}...`);
  console.log("\nCalling SDK (intercepting all fetch requests)...\n");

  try {
    const res = await completeSimple(
      model,
      {
        messages: [{ role: "user", content: "Say ok", timestamp: Date.now() }],
      },
      { apiKey: SETUP_TOKEN, maxTokens: 10, temperature: 0 },
    );

    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    console.log(`\n✅ Response: ${text}`);
  } catch (err) {
    console.error("❌ Error:", err instanceof Error ? err.message : err);
  }

  // Restore
  globalThis.fetch = originalFetch;
}

main();
