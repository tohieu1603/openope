/**
 * Pre-compiled memory-core plugin for Electron bundled app.
 * openclaw/plugin-sdk imports inlined to avoid runtime resolution issues.
 */

function emptyPluginConfigSchema() {
  return {
    safeParse(value) {
      if (value === undefined) return { success: true, data: undefined };
      if (!value || typeof value !== "object" || Array.isArray(value))
        return { success: false, error: { issues: [{ path: [], message: "expected config object" }] } };
      if (Object.keys(value).length > 0)
        return { success: false, error: { issues: [{ path: [], message: "config must be empty" }] } };
      return { success: true, data: value };
    },
    jsonSchema: { type: "object", additionalProperties: false, properties: {} },
  };
}

const memoryCorePlugin = {
  id: "memory-core",
  name: "Memory (Core)",
  description: "File-backed memory search tools and CLI",
  kind: "memory",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    api.registerTool(
      (ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        if (!memorySearchTool || !memoryGetTool) return null;
        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );
    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );
  },
};

export default memoryCorePlugin;
