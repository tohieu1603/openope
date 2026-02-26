import type { ZcaJsUserInfo } from "./types.js";
import { getApiInstance, getSelfInfo } from "./zcajs-client.js";

export interface ZalozcajsProbeResult {
  ok: boolean;
  user?: ZcaJsUserInfo;
  error?: string;
}

export async function probeZalozcajs(
  credentialsPath: string,
  _timeoutMs?: number,
): Promise<ZalozcajsProbeResult> {
  const instance = await getApiInstance(credentialsPath);
  if (!instance) {
    return { ok: false, error: "Not authenticated" };
  }

  const user = await getSelfInfo(instance);
  if (!user) {
    return { ok: false, error: "Failed to get user info" };
  }
  return { ok: true, user };
}
