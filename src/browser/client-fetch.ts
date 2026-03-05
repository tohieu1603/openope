import { formatCliCommand } from "../cli/command-format.js";
import {
  createBrowserControlContext,
  startBrowserControlServiceFromConfig,
} from "./control-service.js";
import { createBrowserRouteDispatcher } from "./routes/dispatcher.js";

function isAbsoluteHttp(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function enhanceBrowserFetchError(url: string, err: unknown, timeoutMs: number): Error {
  const hint = isAbsoluteHttp(url)
    ? "If this is a sandboxed session, ensure the sandbox browser is running and try again."
    : `Start (or restart) the Operis gateway (Operis.app menubar, or \`${formatCliCommand("operis gateway")}\`) and try again.`;
  const msg = String(err);
  const msgLower = msg.toLowerCase();
  const looksLikeTimeout =
    msgLower.includes("timed out") ||
    msgLower.includes("timeout") ||
    msgLower.includes("aborted") ||
    msgLower.includes("abort") ||
    msgLower.includes("aborterror");
  if (looksLikeTimeout) {
    return new Error(
      `Can't reach the Operis browser control service (timed out after ${timeoutMs}ms). ${hint}`,
    );
  }
  return new Error(`Can't reach the Operis browser control service. ${hint} (${msg})`);
}

async function fetchHttpJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init.timeoutMs ?? 5000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Detect transient connection errors worth retrying (timeout, ECONNREFUSED, etc.) */
function isRetryableError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("abort") ||
    msg.includes("aborterror") ||
    msg.includes("browser control disabled") ||
    msg.includes("fetch failed")
  );
}

export async function fetchBrowserJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 5000;
  let lastErr: unknown;

  // Retry once on transient connection errors (2s delay between attempts)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchBrowserJsonOnce<T>(url, init, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && isRetryableError(err)) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }
  throw enhanceBrowserFetchError(url, lastErr, timeoutMs);
}

async function fetchBrowserJsonOnce<T>(
  url: string,
  init: (RequestInit & { timeoutMs?: number }) | undefined,
  timeoutMs: number,
): Promise<T> {
  if (isAbsoluteHttp(url)) {
    return await fetchHttpJson<T>(url, { ...init, timeoutMs });
  }
  const started = await startBrowserControlServiceFromConfig();
  if (!started) {
    throw new Error("browser control disabled");
  }
  const dispatcher = createBrowserRouteDispatcher(createBrowserControlContext());
  const parsed = new URL(url, "http://localhost");
  const query: Record<string, unknown> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  let body = init?.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep as string
    }
  }
  const dispatchPromise = dispatcher.dispatch({
    method:
      init?.method?.toUpperCase() === "DELETE"
        ? "DELETE"
        : init?.method?.toUpperCase() === "POST"
          ? "POST"
          : "GET",
    path: parsed.pathname,
    query,
    body,
  });

  const result = await (timeoutMs
    ? Promise.race([
        dispatchPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out")), timeoutMs),
        ),
      ])
    : dispatchPromise);

  if (result.status >= 400) {
    const message =
      result.body && typeof result.body === "object" && "error" in result.body
        ? String((result.body as { error?: unknown }).error)
        : `HTTP ${result.status}`;
    throw new Error(message);
  }
  return result.body as T;
}
