/**
 * Test: Gọi Anthropic bằng setup token (sk-ant-oat01-*)
 * qua SDK @mariozechner/pi-ai — giống cách OpenClaw gọi.
 */
import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import path from "node:path";

const SETUP_TOKEN =
  "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";

const AGENT_DIR = path.join(process.env.HOME ?? "/Users/admin", ".openclaw/agents/main/agent");

async function main() {
  console.log("=== Test Anthropic Setup Token ===\n");

  // 1. Discover models (giống cách OpenClaw làm)
  const authStorage = new AuthStorage(path.join(AGENT_DIR, "auth.json"));
  const modelRegistry = new ModelRegistry(authStorage, path.join(AGENT_DIR, "models.json"));
  const allModels = modelRegistry.getAll() as Array<Model<Api>>;
  const anthropicModels = allModels.filter((m) => m.provider === "anthropic");

  console.log(`Found ${anthropicModels.length} Anthropic models:`);
  for (const m of anthropicModels) {
    console.log(`  - ${m.provider}/${m.id}`);
  }

  // 2. Pick model
  const model = anthropicModels.find((m) => m.id === "claude-sonnet-4-5") ?? anthropicModels[0];
  if (!model) {
    console.error("No Anthropic model found!");
    process.exit(1);
  }
  console.log(`\nUsing model: ${model.provider}/${model.id}`);
  console.log(`Setup token: ${SETUP_TOKEN.slice(0, 20)}...${SETUP_TOKEN.slice(-10)}`);

  // 3. Gọi API (SDK tự exchange setup token → session key → gọi Anthropic)
  console.log("\nCalling Anthropic via SDK...\n");
  try {
    const res = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: "Xin chào! Trả lời ngắn gọn 1 câu bằng tiếng Việt.",
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: SETUP_TOKEN,
        maxTokens: 100,
        temperature: 0,
      },
    );

    const text = res.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    console.log("✅ Response:", text);
    console.log("\n=== KẾT LUẬN ===");
    console.log("SDK @mariozechner/pi-ai đã exchange setup token thành công.");
    console.log("Setup token sk-ant-oat01-* KHÔNG gọi trực tiếp API được (curl fail),");
    console.log("nhưng qua SDK thì hoạt động vì SDK tự exchange → session key.");
  } catch (err) {
    console.error("❌ Error:", err instanceof Error ? err.message : err);
    console.log("\n=== KẾT LUẬN ===");
    console.log("Token có thể đã hết hạn hoặc bị revoke.");
  }
}

main();
