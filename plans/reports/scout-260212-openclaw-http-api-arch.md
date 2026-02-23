# OpenClaw Codebase Scout Report: HTTP Server & API Architecture

**Date:** 260212 | **Project:** openclaw | **Working Dir:** /Users/admin/openclaw

## Executive Summary

OpenClaw is a WhatsApp gateway CLI with Pi RPC agent, built in TypeScript/Node.js. The HTTP server uses native Node HTTP (not Express or Hono), implements auth middleware, and loads plugins via a registry system. Database: uses native `node:sqlite` (no ORM). Migrations are file-system state-based.

---

## 1. PROJECT STRUCTURE

### Key Directories

```
src/
├── gateway/           # WebSocket + HTTP server (core networking)
├── plugins/           # Plugin system, registry, HTTP route registration
├── channels/          # Chat channel implementations (WhatsApp, Slack, etc.)
├── agents/            # Pi agent integration, sandboxing, tools
├── memory/            # SQLite vector DB, embeddings, session files
├── config/            # Configuration, migrations, paths
├── cli/               # CLI commands, CLI runner
├── infra/             # Infrastructure (logging, networking, migrations)
├── providers/         # Model providers (Anthropic, OpenAI, etc.)
├── hooks/             # Event hooks and bundled hooks
└── ...
```

### Entry Points

- **CLI Entry:** `openclaw.mjs` (bin wrapper)
- **Node Entry:** `src/entry.ts` (main bootstrap)
- **Runtime:** `src/runtime.ts` (default runtime setup)

---

## 2. HTTP SERVER & GATEWAY ARCHITECTURE

### Framework

**Native Node HTTP** (not Express/Hono) — raw `node:http` module.

- Gateway file: `src/gateway/server-http.ts` (main HTTP handler)
- Ports: typically 18789 (local gateway)
- Supports both HTTP and WebSocket upgrade

### Server Initialization

**File:** `src/gateway/server-http.ts`

```typescript
// High-level flow:
// 1. createGatewayHttpServer() creates native Node HTTP server
// 2. Request comes in → dispatched through middleware chain:
//    - Hooks handler (webhooks)
//    - Slack HTTP handler
//    - Plugin request handler
//    - OpenResponses HTTP handler
//    - OpenAI HTTP handler
//    - Canvas host (A2UI)
//    - Control UI
// 3. Each handler returns true if it handled request, false otherwise
// 4. First handler to handle request wins (early exit)
```

### HTTP Handler Chain (Priority Order)

**Location:** `src/gateway/server-http.ts` (lines 350-470)

1. **Hooks Handler** → `createHooksRequestHandler()` (webhooks/integrations)
2. **Slack HTTP** → `handleSlackHttpRequest()`
3. **Plugin Routes** → `createGatewayPluginRequestHandler()` ← **For custom routes**
4. **OpenResponses** → `handleOpenResponsesHttpRequest()`
5. **OpenAI Chat** → `handleOpenAiHttpRequest()`
6. **Canvas/A2UI** → `handleA2uiHttpRequest()` + `canvasHost.handleHttpRequest()`
7. **Control UI** → `handleControlUiHttpRequest()`
8. **404** if nothing matches

---

## 3. AUTH MIDDLEWARE

### Auth System

**File:** `src/gateway/auth.ts`

#### Auth Types

```typescript
export type ResolvedGatewayAuth = {
  mode: "token" | "password";
  token?: string;
  password?: string;
  allowTailscale: boolean;
};

export type GatewayAuthResult = {
  ok: boolean;
  method?: "token" | "password" | "tailscale" | "device-token";
  user?: string;
  reason?: string;
};
```

#### Auth Checks

1. **Local Direct Request** → `isLocalDirectRequest()` (loopback + localhost)
   - Checks: IP is 127.0.0.1/::1, host is localhost/.ts.net
   - Skips auth for local clients (development)

2. **Bearer Token** → `getBearerToken()` from Authorization header
   - Timing-safe comparison: `safeEqual()` (constant-time)

3. **Password** → basic auth

4. **Tailscale** → verified via whois if x-forwarded headers present

5. **Device Token** → for macOS app connections

### Using Auth in HTTP Routes

```typescript
// In handler:
const auth = resolveGatewayAuth({ authConfig: config.gateway?.auth });
const authResult = await authorizeGatewayConnect({
  auth: { ...auth, allowTailscale: false },
  connectAuth: { token: bearerToken, password },
  req,
  trustedProxies: config.gateway?.trustedProxies ?? [],
});

if (!authResult.ok) {
  sendUnauthorized(res); // 401 + JSON error
  return;
}
```

**Key Utilities:**

- `sendUnauthorized(res)` → 401 JSON response
- `getBearerToken(req)` → extract from Authorization header
- `resolveGatewayClientIp()` → proxy-aware IP resolution

---

## 4. PLUGIN SYSTEM & HTTP ROUTES

### Plugin HTTP Route Registration

**Location:** `src/plugins/http-registry.ts`

#### Registering a Plugin HTTP Route

```typescript
import { registerPluginHttpRoute } from "openclaw/plugin-sdk";

export function initializePlugin(api: OpenClawPluginApi) {
  registerPluginHttpRoute({
    path: "/webhook/my-service",
    handler: async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const body = await readJsonBody(req, 1024 * 1024); // 1MB max

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }

      // Your logic here
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
    },
    pluginId: "my-plugin",
    accountId: "default", // optional, for logging
  });
}
```

#### Route Handler Signature

```typescript
export type PluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;
```

#### Path Normalization

- Paths must start with `/` and be absolute
- Fallback path supported if primary is null
- Duplicate paths rejected (logs warning)
- `normalizePluginHttpPath()` handles validation

### Plugin HTTP Handler Registration (Catchall)

For more flexible routing (vs. exact path match):

```typescript
api.onHttpHandler?.(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // Your custom routing logic
  if (url.pathname.startsWith("/my-prefix/")) {
    // Handle request
    return true; // signal handled
  }

  return false; // let other handlers try
});
```

**File:** `src/plugins/types.ts`

```typescript
OpenClawPluginHttpHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>; // return true if handled
```

### Plugin Registry Structure

**File:** `src/plugins/registry.ts`

```typescript
export type PluginRegistry = {
  plugins: PluginRecord[];
  tools: PluginToolRegistration[];
  httpHandlers: PluginHttpRegistration[];
  httpRoutes: PluginHttpRouteRegistration[]; // ← Exact path routes
  cliRegistrars: PluginCliRegistration[];
  // ... other registrations
};

export type PluginHttpRouteRegistration = {
  pluginId?: string;
  path: string; // e.g., "/webhook/slack"
  handler: PluginHttpRouteHandler;
  source?: string;
};
```

### Plugin API

**File:** `src/plugin-sdk/index.ts`

Plugins receive `OpenClawPluginApi` which includes:

- `registerHttpRoute()` — alias for `registerPluginHttpRoute()`
- `onHttpHandler()` — register catchall handler
- Config schema registration
- Tool registration
- Hook registration
- Command registration

---

## 5. HTTP REQUEST/RESPONSE UTILITIES

### Common Response Functions

**File:** `src/gateway/http-common.ts`

```typescript
export function sendJson(res: ServerResponse, status: number, body: unknown);
export function sendText(res: ServerResponse, status: number, body: string);
export function sendMethodNotAllowed(res: ServerResponse, allow = "POST");
export function sendUnauthorized(res: ServerResponse);
export function sendInvalidRequest(res: ServerResponse, message: string);
export async function readJsonBodyOrError(req, res, maxBytes): Promise<unknown>;
export function setSseHeaders(res: ServerResponse); // Server-Sent Events
export function writeDone(res: ServerResponse); // SSE: [DONE]
```

### Utility Functions

**File:** `src/gateway/http-utils.ts`

```typescript
export function getBearerToken(req: IncomingMessage): string | null;
export function getHeader(req: IncomingMessage, name: string): string | undefined;
export function resolveAgentIdForRequest(req, config): string;
export function resolveSessionKey(req): string | null;
```

### Body Reading

**File:** `src/gateway/hooks.ts` (also in http-common.ts)

```typescript
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
```

---

## 6. DATABASE LAYER

### Database System

**Technology:** Native Node.js `node:sqlite` (built-in, no ORM)

- **File:** `src/memory/sqlite.ts` (wrapper for compatibility)
- **Package:** `sqlite-vec` (0.1.7-alpha.2) for vector operations

### SQLite Wrapper

```typescript
export function requireNodeSqlite(): typeof import("node:sqlite") {
  // Lazy-loads native sqlite via require (CommonJS interop)
  return require("node:sqlite") as typeof import("node:sqlite");
}
```

### Usage Pattern

```typescript
import { requireNodeSqlite } from "./memory/sqlite.js";

const sqlite = requireNodeSqlite();
const db = new sqlite.Database("/path/to/db.sqlite");

// Direct SQL queries (no ORM)
db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
db.prepare("INSERT INTO sessions (id, data) VALUES (?, ?)").run(id, data);
```

### Schema/Migrations

**State-based migrations** (not SQL migrations):

- **File:** `src/infra/state-migrations.ts` (legacy state migration)
- **File:** `src/config/legacy.migrations.ts` (config migrations)

These handle legacy → new state directory transitions, not database schema.

### Memory System

**Vector DB & Session Storage:**

- **File:** `src/memory/manager.ts` (75KB — core manager)
- Embeddings from Gemini/OpenAI
- Hybrid search (vector + keyword)
- Session file sync to SQLite

---

## 7. EXISTING API ENDPOINT EXAMPLES

### OpenAI Chat Completions Endpoint

**File:** `src/gateway/openai-http.ts`

```typescript
// POST /v1/chat/completions (OpenAI-compatible)
export async function handleOpenAiHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: OpenAiHttpOptions,
): Promise<boolean>;

// Pattern:
// 1. Check auth
// 2. Parse JSON body
// 3. Validate model/messages
// 4. Invoke agent via agentCommand()
// 5. Stream SSE response or JSON
```

### Slack Webhook Endpoint

**File:** `src/slack/http/index.ts`

```typescript
export async function handleSlackHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: SlackHttpOptions,
): Promise<boolean>;

// Pattern:
// 1. Check URL path (e.g., /slack/webhooks)
// 2. Verify Slack signature
// 3. Parse Slack event payload
// 4. Route to channel plugin
```

### Tools Invoke Endpoint

**File:** `src/gateway/tools-invoke-http.ts`

```typescript
export async function handleToolsInvokeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts,
): Promise<boolean>;

// POST /_tools/invoke (internal API)
// Used by canvas/browser to invoke tools from agents
```

---

## 8. ADDING A NEW API ENDPOINT

### Quick Start: Plugin HTTP Route

**Step 1: Create handler**

```typescript
// my-plugin/src/index.ts
import { registerPluginHttpRoute, OpenClawPluginApi } from "openclaw/plugin-sdk";

export default function initializePlugin(api: OpenClawPluginApi) {
  registerPluginHttpRoute({
    path: "/webhook/my-service",
    handler: async (req, res) => {
      // req: IncomingMessage (Node.js native)
      // res: ServerResponse (Node.js native)

      // Check method
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method Not Allowed");
        return;
      }

      // Parse body
      let body;
      try {
        body = await parseJsonBody(req, 1024 * 1024);
      } catch (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      // Your business logic
      const result = { processed: true, timestamp: Date.now() };

      // Send response
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    },
    pluginId: "my-plugin",
  });
}
```

**Step 2: Helper function for JSON parsing**

```typescript
async function parseJsonBody(req, maxBytes) {
  let data = "";
  for await (const chunk of req) {
    data += chunk.toString();
    if (data.length > maxBytes) {
      throw new Error("Payload too large");
    }
  }
  return JSON.parse(data);
}
```

### Quick Start: Core Gateway Route

**Add directly in gateway server (if not plugin):**

1. Create handler in `src/gateway/` (e.g., `my-service-http.ts`)
2. Export function: `export async function handleMyServiceHttpRequest(req, res, opts): Promise<boolean>`
3. Register in `server-http.ts` in the handler chain
4. Return `true` if handled, `false` otherwise

---

## 9. AUTHENTICATION IN CUSTOM ROUTES

### With Plugin Auth Check

```typescript
import { getBearerToken } from "openclaw/plugin-sdk";

export default function initializePlugin(api: OpenClawPluginApi) {
  registerPluginHttpRoute({
    path: "/secure/endpoint",
    handler: async (req, res) => {
      // Option 1: Get token from request
      const token = getBearerToken(req);

      // Option 2: Validate against stored tokens
      if (!token || !isValidToken(token)) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Proceed with authenticated request
      res.statusCode = 200;
      res.end("OK");
    },
  });
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}
```

**Note:** Plugin routes bypass gateway-level auth. Implement your own if needed.

---

## 10. GATEWAY METHODS (Advanced RPC Routes)

Alternative to HTTP routes: Gateway request handlers (for Pi RPC).

**File:** `src/gateway/server-methods/types.ts`

```typescript
export type GatewayRequestHandler = (
  req: GatewayRequest, // { methodName, params, ... }
  ctx: GatewayRequestContext,
  respond: RespondFn,
) => Promise<void>;

// Registered in plugin via:
api.registerGatewayRequestHandler?.({
  method: "my.custom.method",
  handler: async (req, ctx, respond) => {
    respond({ result: "..." });
  },
});
```

Used for RPC-style methods, less common than HTTP routes.

---

## 11. FILE LOCATIONS SUMMARY

| Concern                  | Files                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **Main HTTP Server**     | `src/gateway/server-http.ts`                                                                |
| **Auth Middleware**      | `src/gateway/auth.ts`                                                                       |
| **HTTP Utilities**       | `src/gateway/http-common.ts`, `http-utils.ts`                                               |
| **Plugin HTTP Registry** | `src/plugins/http-registry.ts`                                                              |
| **Plugin Registry**      | `src/plugins/registry.ts`                                                                   |
| **Plugin SDK**           | `src/plugin-sdk/index.ts`                                                                   |
| **SQLite Access**        | `src/memory/sqlite.ts` (wrapper)                                                            |
| **Memory/Vector DB**     | `src/memory/manager.ts`                                                                     |
| **Config**               | `src/config/config.ts`, `paths.ts`                                                          |
| **Entry Point**          | `src/entry.ts`                                                                              |
| **Existing Routes**      | `src/gateway/openai-http.ts`, `src/slack/http/index.ts`, `src/gateway/tools-invoke-http.ts` |

---

## 12. MIGRATION SYSTEM (State-Based, Not DB Schema)

OpenClaw uses **state directory migrations**, not database schema migrations.

**File:** `src/infra/state-migrations.ts`

```typescript
// Handles:
// - Legacy session directory → new agent-specific paths
// - Legacy agent dir → agents/<agentId>/agent
// - Legacy WhatsApp auth → new oauth structure

export async function autoMigrateLegacyState(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}): Promise<{
  migrated: boolean;
  skipped: boolean;
  changes: string[];
  warnings: string[];
}>;
```

**No SQL schema migrations** — SQLite schema is defined in code, inline with DB usage.

---

## 13. KEY ARCHITECTURAL PATTERNS

### Handler Chaining

Each HTTP handler:

- Checks if it should handle the request (URL pattern, method, etc.)
- Returns `true` if handled, `false` otherwise
- First `true` wins; chain stops

### Lazy Initialization

- Database connections opened on-demand
- Config loaded once, cached
- Plugin registry built at startup

### Request Context

- `IncomingMessage` (req): native Node HTTP request
- `ServerResponse` (res): native Node HTTP response
- No wrapper/middleware framework — direct Node APIs

### Error Handling

- No global error handler (each route responsible)
- Return HTTP error response codes
- Log errors to subsystem logger

---

## 14. TESTING ENTRY POINTS

### Unit Tests

```bash
pnpm test                    # Run all tests
pnpm test:watch             # Watch mode
pnpm test:coverage          # Coverage report
```

### Gateway E2E Tests

```bash
pnpm test:e2e               # E2E tests
OPENCLAW_LIVE_TEST=1 pnpm test:live  # Live tests (real APIs)
```

### Example Test Files

- `src/gateway/openai-http.e2e.test.ts`
- `src/gateway/server.auth.e2e.test.ts`
- `src/plugins/http-registry.test.ts` (minimal plugin HTTP registry test)

---

## 15. UNRESOLVED QUESTIONS

1. **Is there a built-in request ID/correlation ID system?** (for logging across handler chain)
   - Not found in http-common or auth files

2. **Are there rate-limiting mechanisms for HTTP routes?**
   - Not found in core gateway; delegated to plugins

3. **Is request/response middleware composable (e.g., add auth wrapper)?**
   - Handler chain is linear; no middleware pattern

4. **How to stream large responses (files, etc.)?**
   - Direct `res.write()` calls work; SSE pattern exists for chat

5. **Are there built-in webhooks/event delivery retries?**
   - Hooks system exists but retry logic unclear from scout

---

## 16. QUICK REFERENCE: HTTP ROUTE CHECKLIST

✅ Decide: Plugin route vs core route
✅ Create handler function (`(req, res) => Promise<void>`)
✅ Register path (e.g., `/webhook/my-service`)
✅ Handle auth if needed (bearer token, custom)
✅ Parse request body (JSON, form, etc.)
✅ Validate input with zod/typebox if needed
✅ Call business logic / agent commands
✅ Set response headers (`Content-Type`, etc.)
✅ Send response (`res.end(JSON.stringify(...))`)
✅ Test with `pnpm test` + E2E test file

---

**Report Generated:** 2026-02-12
**Version:** openclaw@2026.2.4
**Framework:** Node.js HTTP (native) + Plugin System
**Database:** node:sqlite (no ORM)
**Auth:** Token/Password/Tailscale/Device with timing-safe comparison
