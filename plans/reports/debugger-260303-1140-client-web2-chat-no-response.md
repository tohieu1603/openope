# Debugger Report: client-web2 Chat Messages Not Receiving Responses

**Date:** 2026-03-03
**Slug:** client-web2-chat-no-response

---

## Executive Summary

client-web2 uses a **different chat transport** than client-web. client-web sends via HTTP POST SSE (`sendChatMessage` → `/chat/stream`). client-web2 sends via **WebSocket `chat.send` request** to the gateway and expects streaming back via WebSocket `"chat"` events. The UI gets stuck in loading state because `chatSending` is only cleared when a `final` or `error` `ChatStreamEvent` arrives over the WebSocket — but that event never arrives, or the guard condition in `handleChatStreamEvent` blocks it from being processed.

Root cause: **`handleChatStreamEvent` has a guard `if (!this.chatSending || this.chatStreamingRunId === "sse-stream") return`** — `chatStreamingRunId` is never set to `"sse-stream"` in client-web2 (only in client-web), so that guard is harmless. The actual problem is that `chatSending` is set to `true` on send, but is only cleared by `handleChatStreamEvent` receiving `state: "final"` or `state: "error"` — if those WebSocket events don't arrive, the UI hangs forever.

**Three concrete causes identified:**

1. **Wrong/missing `VITE_GATEWAY_WS` in `.env`** — gateway WebSocket connects to wrong port.
2. **`chat.send` WS method not supported by gateway** — gateway logs show request received but no `chat` WS events emitted back.
3. **`sessionKey` mismatch** — client-web2 sends `sessionKey: this.chatConversationId || "main"` but gateway may emit events to a different session key.

---

## Technical Analysis

### Transport Difference (Root Architecture Split)

| Aspect | client-web | client-web2 |
|---|---|---|
| Send method | HTTP POST SSE via `sendChatMessage()` → `/chat/stream` | WebSocket `gw.request("chat.send", ...)` |
| Response mechanism | SSE `ReadableStream` from fetch response body | WebSocket `"chat"` event → `handleChatStreamEvent()` |
| `chatSending` cleared by | SSE result resolves (await returns) | `handleChatStreamEvent(state: "final"/"error")` |
| AbortController | Yes — `this.chatAbortController` | No — uses `gw.request("chat.abort", ...)` |
| Backoff on no-response | SSE inactivity timeout (120s) throws | None — hangs forever if WS events don't arrive |

### `handleSendMessage` in client-web2 (lines 1016–1084)

```typescript
// client-web2/src/ui/app.ts:1042-1070
const gw = await waitForConnection(5000);
const runId = crypto.randomUUID();
this.chatRunId = runId;
await gw.request(
  "chat.send",
  {
    sessionKey: this.chatConversationId || "main",
    message: userMessage,
    idempotencyKey: runId,
    ...
  },
  30_000,
);
// chat.send returns { runId, status: "started" } immediately.
// Streaming handled by handleChatStreamEvent (delta → final/error).
// chatSending cleared when final/error event arrives.
```

`gw.request("chat.send")` returns quickly with `{ runId, status: "started" }`. After that, `chatSending` remains `true` — cleared ONLY by incoming WS `chat` events.

### `handleChatStreamEvent` guard (line 584)

```typescript
// client-web2/src/ui/app.ts:581-584
private handleChatStreamEvent(evt: ChatStreamEvent) {
  // Only process events if we're actively sending AND using WebSocket streaming (not SSE)
  // SSE streaming sets chatStreamingRunId = "sse-stream", skip WebSocket events in that case
  if (!this.chatSending || this.chatStreamingRunId === "sse-stream") return;
```

The comment says "SSE streaming sets chatStreamingRunId = 'sse-stream'" — but in client-web2, `chatStreamingRunId` is **never** set to `"sse-stream"` (that only happens in client-web where SSE is used). So this guard itself is not the blocker. The blocker is that **the WS `chat` events never arrive** at the listener.

### WS URL Configuration

**client-web2 `gateway-client.ts` fallback logic (line 464–476):**
```typescript
function getGatewayWsUrl(): string {
  if (import.meta.env.VITE_GATEWAY_WS) {
    return import.meta.env.VITE_GATEWAY_WS;
  }
  // Electron file:// or dev server (port 5173) - connect to local gateway
  if (!host || window.location.protocol === "file:" || host.includes(":5173")) {
    return "ws://127.0.0.1:18789/";
  }
  return `${protocol}//${host}/`;
}
```

**`.env.example` (client-web2):**
```
VITE_API_BASE_URL=http://localhost:3025/api
VITE_GATEWAY_WS=ws://127.0.0.1:3000/
```

- `.env.example` sets `VITE_GATEWAY_WS=ws://127.0.0.1:3000/`
- Gateway runs on port **18789** (from `fl.md` and `vite.config.ts` default)
- **If `.env` copies from `.env.example`, WS connects to port 3000 instead of 18789 — connection will fail or succeed but `chat.send` will be unrecognized**

**`vite.config.ts` (client-web2):** Vite dev proxy only proxies `/api` HTTP, not WebSocket to the gateway. The raw `VITE_GATEWAY_WS` env var is used directly by `gateway-client.ts`. If this points to wrong port, WebSocket connects but `chat.send` may be handled by a different service.

### `chat.send` vs `chat/stream` — Gateway Support

The gateway logs show "tool definitions logged, usage session logged" — this confirms the gateway receives the request and starts processing. However, the symptom is the UI never receives the response. This points to:

1. Gateway sends `chat` WS events back only to the **session/client that initiated** — if WS connection is to port 3000 (a different service) while the request was sent to port 18789, events go to 18789 clients only.
2. Or the gateway emits `chat` events but the `onEvent` handler in `gateway-client.ts` only routes `evt.event === "chat"` — if gateway emits under a different event name, it's dropped silently.

### Event routing in gateway-client.ts (identical in both)

```typescript
onEvent: (evt) => {
  if (evt.event === "cron" && evt.payload) { notifyCronListeners(...) }
  if (evt.event === "chat" && evt.payload) { notifyChatStreamListeners(...) }  // <-- must be "chat"
  if (evt.event === "agent" && evt.payload) { ... }
},
```

If the gateway emits events under `evt.event !== "chat"`, `notifyChatStreamListeners` is never called → `handleChatStreamEvent` never fires → `chatSending` never cleared → UI stuck.

---

## Root Causes (Priority Order)

### CAUSE 1 (Most Likely): Wrong `VITE_GATEWAY_WS` port in `.env`

`.env.example` has `VITE_GATEWAY_WS=ws://127.0.0.1:3000/` but gateway runs on `18789`. If local `.env` copied this value, the WebSocket for receiving streaming events connects to port 3000 (possibly nothing or a different service). The `chat.send` request goes via the **same WS connection** — so `await gw.request("chat.send")` might also fail with "gateway not connected" or timeout after 30s.

**Verification:** Check browser DevTools Network tab → WS connection. What port does it connect to?

### CAUSE 2 (Likely): Gateway does not emit `event: "chat"` events over WS

The gateway may handle `chat.send` via the API handler (HTTP/SSE path internally) but emit results under a different WS event name, or not emit WS events at all for chat responses. The cron system emits `event: "cron"` — the chat WS streaming must emit `event: "chat"` with `ChatStreamEvent` payload for the listener to pick it up.

**Verification:** Add a catch-all in `onEvent` to log ALL incoming WS events during a chat send. If no `"chat"` event arrives, the gateway doesn't support WS streaming for chat.

### CAUSE 3 (Possible): `chat.send` method not registered on gateway WS protocol

The gateway WS protocol handles `connect`, `cron.*` etc. If `chat.send` is not a registered WS method, `gw.request("chat.send")` would time out after 30s and throw — which would be caught and show an error message, NOT leave UI in loading state. So if the UI is stuck (not showing error), `chat.send` is being handled but events don't come back.

---

## Actionable Recommendations

### Immediate Fix

**Fix 1: Correct `VITE_GATEWAY_WS` in `client-web2/.env`**

File: `d:/Project/SourceCode/agent.operis/client-web2/.env`

Change:
```
VITE_GATEWAY_WS=ws://127.0.0.1:3000/
```
To:
```
VITE_GATEWAY_WS=ws://127.0.0.1:18789/
```

**Fix 2: Add debug logging to `onEvent` handler**

In `d:/Project/SourceCode/agent.operis/client-web2/src/ui/gateway-client.ts`, temporarily add:

```typescript
onEvent: (evt) => {
  console.log("[gateway] raw event:", evt.event, JSON.stringify(evt.payload).slice(0, 200));
  // ... existing handlers
},
```

This will reveal what events (if any) arrive after `chat.send`.

**Fix 3 (if gateway doesn't send WS `chat` events): Fall back to SSE**

If the gateway WS `chat.send` doesn't produce WS events back, client-web2 needs to use the same SSE approach as client-web:

In `handleSendMessage` of `client-web2/src/ui/app.ts`, replace the `gw.request("chat.send")` block with `sendChatMessage(...)` call (same as client-web lines 1156–1172), including setting `chatStreamingRunId = "sse-stream"` so the WS handler guard is respected.

### Structural Recommendation

The `handleChatStreamEvent` guard comment in client-web2 is misleading — it says "SSE streaming sets chatStreamingRunId = 'sse-stream'" but client-web2 never uses SSE. The guard should be simplified or removed since it's dead code in client-web2's context.

---

## Supporting Evidence

- `client-web2/src/ui/app.ts:1043–1066`: Sends via WS `chat.send`, no SSE fallback
- `client-web2/src/ui/app.ts:581–647`: `handleChatStreamEvent` only reacts to WS `"chat"` events
- `client-web2/src/ui/gateway-client.ts:492–510`: Event router only dispatches `evt.event === "chat"`
- `client-web2/.env.example:11`: `VITE_GATEWAY_WS=ws://127.0.0.1:3000/` — wrong port vs gateway's 18789
- `client-web2/vite.config.ts:29`: `apiTarget` defaults to `http://127.0.0.1:18789`
- `client-web/src/ui/app.ts:1156–1164`: Uses `sendChatMessage` SSE, sets `chatStreamingRunId = "sse-stream"`

---

## Unresolved Questions

1. What does the actual `client-web2/.env` contain for `VITE_GATEWAY_WS`? (blocked by privacy hook — needs user to confirm)
2. Does the gateway WS protocol actually implement `chat.send` as a method that returns WS events? (gateway source not inspected)
3. What WS event name does the gateway emit for chat streaming — is it `"chat"` or something else?
4. Is there a session-key scoping issue on the gateway side (events only sent to the WS client that holds a matching session)?
