# OpenClaw HTTP Server & API Architecture - File Index

**Generated:** 2026-02-12 | **Total Files Analyzed:** 40+

## Critical Core Files

### Gateway HTTP Server (Entry Points)

| File                                               | Purpose                                      | Lines | Key Exports                                                  |
| -------------------------------------------------- | -------------------------------------------- | ----- | ------------------------------------------------------------ |
| `/Users/admin/openclaw/src/gateway/server-http.ts` | Main HTTP request dispatcher + handler chain | 481   | `createGatewayHttpServer()`, `attachGatewayUpgradeHandler()` |
| `/Users/admin/openclaw/src/gateway/http-common.ts` | Response helpers (JSON, text, errors)        | 57    | `sendJson()`, `sendUnauthorized()`, `readJsonBodyOrError()`  |
| `/Users/admin/openclaw/src/gateway/http-utils.ts`  | Request utilities (headers, auth parsing)    | N/A   | `getBearerToken()`, `resolveSessionKey()`                    |

### Authentication & Auth Middleware

| File                                               | Purpose                                         | Lines | Key Exports                                                                   |
| -------------------------------------------------- | ----------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `/Users/admin/openclaw/src/gateway/auth.ts`        | Complete auth system (token/password/Tailscale) | 200+  | `authorizeGatewayConnect()`, `isLocalDirectRequest()`, `resolveGatewayAuth()` |
| `/Users/admin/openclaw/src/gateway/device-auth.ts` | Device-specific auth (macOS app)                | N/A   | Device token validation                                                       |

### Plugin System - HTTP Routes

| File                                                       | Purpose                            | Lines | Key Exports                                     |
| ---------------------------------------------------------- | ---------------------------------- | ----- | ----------------------------------------------- |
| `/Users/admin/openclaw/src/plugins/http-registry.ts`       | Plugin HTTP route registration API | 53    | `registerPluginHttpRoute()`                     |
| `/Users/admin/openclaw/src/plugins/registry.ts`            | Central plugin registry            | 200+  | `createPluginRegistry()`, `PluginRegistry` type |
| `/Users/admin/openclaw/src/plugins/http-path.ts`           | Path normalization for routes      | Small | `normalizePluginHttpPath()`                     |
| `/Users/admin/openclaw/src/gateway/server/plugins-http.ts` | Plugin request handler in gateway  | 62    | `createGatewayPluginRequestHandler()`           |

### Plugin SDK (Public API)

| File                                            | Purpose                     | Lines | Key Exports                                    |
| ----------------------------------------------- | --------------------------- | ----- | ---------------------------------------------- |
| `/Users/admin/openclaw/src/plugin-sdk/index.ts` | Official plugin SDK exports | 500+  | `registerPluginHttpRoute`, `OpenClawPluginApi` |

### Database & State Management

| File                                                  | Purpose                             | Lines | Key Exports                                                 |
| ----------------------------------------------------- | ----------------------------------- | ----- | ----------------------------------------------------------- |
| `/Users/admin/openclaw/src/memory/sqlite.ts`          | SQLite native wrapper               | 10    | `requireNodeSqlite()`                                       |
| `/Users/admin/openclaw/src/infra/state-migrations.ts` | Legacy state → new state migrations | 906   | `autoMigrateLegacyState()`, `detectLegacyStateMigrations()` |

### Existing HTTP Handlers (Examples)

| File                                                     | Purpose                          | Lines | Key Exports                      |
| -------------------------------------------------------- | -------------------------------- | ----- | -------------------------------- |
| `/Users/admin/openclaw/src/gateway/openai-http.ts`       | OpenAI chat completions endpoint | 200+  | `handleOpenAiHttpRequest()`      |
| `/Users/admin/openclaw/src/slack/http/index.ts`          | Slack webhook handler            | Small | `handleSlackHttpRequest()`       |
| `/Users/admin/openclaw/src/gateway/tools-invoke-http.ts` | Tools invocation HTTP endpoint   | N/A   | `handleToolsInvokeHttpRequest()` |

### Configuration & Paths

| File                                         | Purpose                      | Lines | Key Exports                              |
| -------------------------------------------- | ---------------------------- | ----- | ---------------------------------------- |
| `/Users/admin/openclaw/src/config/config.ts` | Main config loader           | 200+  | `loadConfig()`, `OpenClawConfig` type    |
| `/Users/admin/openclaw/src/config/paths.ts`  | Config/state path resolution | N/A   | `resolveStateDir()`, `resolveOAuthDir()` |

---

## Secondary Support Files

### Request Parsing & Body Handling

| File                           | Purpose                                 |
| ------------------------------ | --------------------------------------- |
| `src/gateway/hooks.ts`         | Webhook/hook handler + `readJsonBody()` |
| `src/gateway/server-shared.ts` | Shared utilities                        |

### Logging & Infrastructure

| File                       | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `src/logging/subsystem.ts` | Subsystem logger factory                           |
| `src/infra/net.ts`         | Network utilities (IP resolution, proxy detection) |
| `src/infra/tailscale.ts`   | Tailscale integration                              |

### Plugin Types & Runtime

| File                     | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `src/plugins/types.ts`   | Plugin API types (`OpenClawPluginApi`, `OpenClawPluginHttpHandler`, etc.) |
| `src/plugins/runtime.ts` | Plugin runtime management                                                 |
| `src/plugins/loader.ts`  | Plugin discovery & loading                                                |

### Test Utilities

| File                                         | Purpose               |
| -------------------------------------------- | --------------------- |
| `src/gateway/server/__tests__/test-utils.ts` | Test registry factory |
| `src/test-utils/channel-plugins.ts`          | Mock plugin registry  |

---

## Entry Point Chain

```
CLI: openclaw.mjs
  ↓
src/entry.ts (argument parsing, respawn guard)
  ↓
src/runtime.ts (default runtime setup)
  ↓
src/index.ts (main exports)
  ↓
src/commands/gateway.ts (gateway command handler)
  ↓
src/gateway/server-http.ts (HTTP server creation)
```

---

## HTTP Handler Chain (Priority Order)

Defined in `src/gateway/server-http.ts` lines 350-470:

```
Request
  ↓
createHooksRequestHandler()         ← Webhooks
  ↓ (if not handled)
handleSlackHttpRequest()            ← Slack events
  ↓ (if not handled)
createGatewayPluginRequestHandler() ← Plugin HTTP routes ⭐
  ↓ (if not handled)
handleOpenResponsesHttpRequest()    ← OpenResponses protocol
  ↓ (if not handled)
handleOpenAiHttpRequest()           ← OpenAI-compatible endpoint
  ↓ (if not handled)
handleA2uiHttpRequest() / canvasHost← Canvas/browser UI
  ↓ (if not handled)
handleControlUiHttpRequest()        ← Control panel UI
  ↓ (if not handled)
404 Not Found
```

---

## Database Connection Flow

```
src/memory/manager.ts (Vector DB manager)
  ↓
src/memory/sqlite.ts
  ↓
require("node:sqlite") (Native Node.js)
  ↓
SQLite database file
```

**No ORM used.** Direct prepared statements via `db.prepare().get()` / `.run()`.

---

## Auth Flow

```
Request → http-common.ts: getBearerToken()
  ↓
gateway/auth.ts: resolveGatewayAuth()
  ↓
[4 auth checks]
  1. isLocalDirectRequest()     ← localhost/loopback
  2. Token (timing-safe equal)
  3. Password
  4. Tailscale (x-forwarded headers)
  ↓
authorizeGatewayConnect() → GatewayAuthResult
  ↓
handler proceeds or sends 401
```

---

## Plugin HTTP Route Flow

```
Plugin init:
  registerPluginHttpRoute({ path, handler, pluginId })
    ↓
  src/plugins/registry.ts: registry.httpRoutes.push(entry)

Request arrives:
  src/gateway/server-http.ts: await handlePluginRequest(req, res)
    ↓
  src/gateway/server/plugins-http.ts: createGatewayPluginRequestHandler()
    ↓
  Find route by exact path match: routes.find(r => r.path === url.pathname)
    ↓
  Call handler(req, res)
    ↓
  Return true (handled) or false (not handled)
```

---

## Key Types

### Request/Response (Native Node)

```typescript
import { IncomingMessage, ServerResponse } from "node:http";

// Handler signature:
(req: IncomingMessage, res: ServerResponse) => Promise<void> | void
```

### Plugin HTTP Route

```typescript
export type PluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

export type PluginHttpRouteRegistration = {
  pluginId?: string;
  path: string; // e.g., "/webhook/my-service"
  handler: PluginHttpRouteHandler;
  source?: string;
};
```

### Auth Result

```typescript
export type GatewayAuthResult = {
  ok: boolean;
  method?: "token" | "password" | "tailscale" | "device-token";
  user?: string;
  reason?: string;
};
```

### Plugin Registry

```typescript
export type PluginRegistry = {
  httpRoutes: PluginHttpRouteRegistration[]; // Exact path routes
  httpHandlers: PluginHttpRegistration[]; // Catchall handlers
  // ... other arrays (tools, hooks, channels, etc.)
};
```

---

## Common Patterns

### Reading JSON Request Body

```typescript
import { readJsonBodyOrError } from "./http-common.js";

const body = await readJsonBodyOrError(req, res, 1024 * 1024);
```

### Sending Responses

```typescript
import { sendJson, sendUnauthorized, sendText } from "./http-common.js";

sendJson(res, 200, { result: "..." });
sendUnauthorized(res); // 401
sendText(res, 400, "Bad request");
```

### Checking Bearer Token

```typescript
import { getBearerToken } from "./http-utils.js";

const token = getBearerToken(req);
if (!token || !isValidToken(token)) {
  sendUnauthorized(res);
  return;
}
```

### Setting Headers

```typescript
res.setHeader("Content-Type", "application/json");
res.statusCode = 200;
res.end(JSON.stringify(data));
```

---

## Testing Files

### Gateway HTTP Tests

- `src/gateway/openai-http.e2e.test.ts` — OpenAI endpoint E2E
- `src/gateway/server.auth.e2e.test.ts` — Auth E2E
- `src/gateway/auth.test.ts` — Auth unit tests
- `src/gateway/server-http.test.ts` — Server tests (if exists)

### Plugin HTTP Tests

- `src/gateway/server/plugins-http.test.ts` — Plugin handler unit tests
- `src/plugins/http-registry.test.ts` — HTTP registry registration tests

### Slack HTTP Tests

- `src/slack/http/registry.test.ts` — Slack route tests

---

## Config & Paths

### State Directory Structure

```
~/.openclaw/                                    ← resolveStateDir()
├── agents/
│   ├── default/                               ← default agent
│   │   ├── agent/                             ← agent files
│   │   ├── sessions/
│   │   │   ├── sessions.json                  ← session store
│   │   │   └── *.jsonl                        ← session logs
│   │   └── ...
│   └── <agentId>/
├── oauth/
│   └── whatsapp/
│       └── default/
│           └── creds.json                     ← WhatsApp auth
└── ...
```

---

## Package.json Key Dependencies

| Dep          | Version       | Use                                       |
| ------------ | ------------- | ----------------------------------------- |
| `express`    | ^5.2.1        | NOT USED for gateway; might be in plugins |
| `hono`       | 4.11.7        | NOT USED; possible old choice             |
| `ws`         | ^8.19.0       | WebSocket server                          |
| `sqlite-vec` | 0.1.7-alpha.2 | SQLite vector extension                   |
| `zod`        | ^4.3.6        | Schema validation                         |

**Framework:** Native `node:http` (raw Node HTTP, not Express/Hono)

---

## Quick Command Reference

```bash
# Run gateway in dev mode
pnpm gateway:dev

# Run gateway with fresh config
pnpm gateway:dev:reset

# Run tests
pnpm test
pnpm test:watch
pnpm test:e2e

# Build
pnpm build

# Lint & format
pnpm lint
pnpm format:fix
```

---

## Relative Paths (from /Users/admin/openclaw/)

All absolute paths listed above. For convenience:

- Gateway HTTP server: `./src/gateway/server-http.ts`
- Plugin HTTP registry: `./src/plugins/http-registry.ts`
- Auth middleware: `./src/gateway/auth.ts`
- Plugin SDK: `./src/plugin-sdk/index.ts`
- Config loader: `./src/config/config.ts`
- SQLite wrapper: `./src/memory/sqlite.ts`

---

**Notes:**

- No SQL schema migrations (state-based migrations only)
- No ORM (direct SQLite queries)
- Native Node HTTP (no Express/Hono middleware)
- Auth is opt-in for plugin routes (plugins implement own auth)
- Plugin routes take priority in handler chain
- Exact path matching for plugin routes (no wildcard pattern support built-in)

---

**End of File Index**
