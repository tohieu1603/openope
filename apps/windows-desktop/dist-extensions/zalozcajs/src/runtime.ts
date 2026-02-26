import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setZalozcajsRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getZalozcajsRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Zalozcajs runtime not initialized");
  }
  return runtime;
}
