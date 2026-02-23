import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { zalozcajsDock, zalozcajsPlugin } from "./src/channel.js";
import { setZalozcajsRuntime } from "./src/runtime.js";
import { ZalozcajsToolSchema, executeZalozcajsTool } from "./src/tool.js";

const plugin = {
  id: "zalozcajs",
  name: "Zalo Personal (zca-js)",
  description: "Zalo personal account messaging via zca-js library",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setZalozcajsRuntime(api.runtime);
    // Register channel plugin (for onboarding & gateway)
    api.registerChannel({ plugin: zalozcajsPlugin, dock: zalozcajsDock });

    // Register agent tool
    api.registerTool({
      name: "zalozcajs",
      label: "Zalo Personal (zca-js)",
      description:
        "Send messages and access data via Zalo personal account (zca-js). " +
        "Actions: send (text message), friends (list/search friends), " +
        "groups (list groups), me (profile info), status (auth check).",
      parameters: ZalozcajsToolSchema,
      execute: executeZalozcajsTool,
    });
  },
};

export default plugin;
