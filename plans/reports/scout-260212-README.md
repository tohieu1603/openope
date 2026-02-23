# OpenClaw Scout Report - Complete Analysis

**Date:** 2026-02-12 | **Project:** openclaw | **Repository:** /Users/admin/openclaw

## Overview

Complete scout analysis of OpenClaw's HTTP server architecture, API endpoint patterns, database layer, and plugin system. Perfect for understanding how to add new API routes and integrate with the gateway.

---

## Report Files (1,437 lines total)

### 1. **scout-260212-openclaw-http-api-arch.md** (643 lines)

**Full Architectural Documentation**

Comprehensive deep-dive covering:

- Project structure and directory layout
- HTTP server framework (native Node.js)
- Authentication middleware and auth flow
- Plugin system and HTTP route registration
- HTTP utilities and response helpers
- Database layer (SQLite, no ORM)
- Existing API endpoint examples
- Step-by-step guide to adding new endpoints
- Auth implementation patterns
- Gateway methods (RPC routes)
- Migration system
- Key architectural patterns
- Testing entry points
- Unresolved questions

**Start here for:** Complete understanding of architecture

---

### 2. **scout-260212-file-index.md** (370 lines)

**File Reference & Navigation Guide**

Critical reference showing:

- All core gateway files with line counts and exports
- Authentication files and auth flow
- Plugin system files
- Plugin SDK
- Database and state management files
- Configuration files
- Existing HTTP handler examples
- HTTP handler priority chain
- Test files locations
- Database connection flow
- Auth flow diagram
- Plugin HTTP route flow
- Common types and patterns
- Testing files
- Config/paths structure
- Quick command reference

**Start here for:** Finding specific files and understanding flow

---

### 3. **scout-260212-quick-start.md** (424 lines)

**Practical Implementation Guide**

Hands-on guide with examples:

- 3-step tutorial: Add new webhook endpoint
- Common task recipes
  - Read request headers
  - Validate bearer tokens
  - Stream responses
  - Parse query strings
  - Return JSON errors
  - Handle file uploads
- Architecture overview diagram
- File organization for custom plugins
- Environment & configuration
- Request object reference
- Response object reference
- Testing instructions (curl + Vitest)
- Debugging tips
- Common mistakes & fixes
- Next steps checklist

**Start here for:** Quick implementation and code examples

---

## Quick Facts

| Aspect             | Details                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| **HTTP Framework** | Native Node.js `node:http` (no Express/Hono)                                 |
| **Port**           | 18789 (typical local gateway)                                                |
| **Database**       | SQLite (native `node:sqlite`, no ORM)                                        |
| **Auth Types**     | Bearer token, password, Tailscale, device token                              |
| **Plugin Routes**  | Exact path matching, no regex/wildcards                                      |
| **Route Priority** | Hooks → Slack → Plugins → OpenResponses → OpenAI → Canvas → Control UI → 404 |
| **Request Type**   | Native `IncomingMessage` (Node.js)                                           |
| **Response Type**  | Native `ServerResponse` (Node.js)                                            |
| **Migrations**     | State-based (not SQL schema)                                                 |
| **Auth Level**     | Gateway-level optional, per-route required                                   |

---

## Entry Points by Use Case

### "I want to add a new API endpoint"

→ **scout-260212-quick-start.md** (copy-paste code)
→ Then **scout-260212-openclaw-http-api-arch.md** (section 8)

### "I need to understand the architecture"

→ **scout-260212-openclaw-http-api-arch.md** (full read)
→ Then **scout-260212-file-index.md** (for file locations)

### "I need to find a specific file"

→ **scout-260212-file-index.md** (use tables)
→ Then read that file directly

### "I need to implement auth for my endpoint"

→ **scout-260212-quick-start.md** (section "Validate Bearer Token")
→ **scout-260212-openclaw-http-api-arch.md** (section 3 + section 9)

### "I'm debugging a route that doesn't work"

→ **scout-260212-quick-start.md** (section "Common Mistakes & Fixes")
→ **scout-260212-file-index.md** (HTTP Handler Chain diagram)

### "I need test examples"

→ **scout-260212-quick-start.md** (section "Testing Your Endpoint")
→ **scout-260212-openclaw-http-api-arch.md** (section 14)

---

## Key Concepts Explained

### HTTP Handler Chain

OpenClaw dispatches incoming HTTP requests through a chain of handlers. First handler to return `true` wins. Plugin routes come 3rd in priority (after Hooks and Slack, before OpenResponses).

**File:** `src/gateway/server-http.ts` lines 350-470

### Plugin HTTP Routes

Register exact-path routes that run your handler when matched.

**File:** `src/plugins/http-registry.ts`

**API:**

```typescript
registerPluginHttpRoute({
  path: "/webhook/my-service",
  handler: async (req, res) => { ... },
  pluginId: "my-plugin"
});
```

### Authentication

Gateway provides auth utilities. Plugin routes bypass gateway-level auth; implement your own if needed.

**Files:** `src/gateway/auth.ts`, `src/gateway/http-utils.ts`

### Database

Uses native SQLite (no ORM). Direct SQL queries via `db.prepare().get()` / `.run()`.

**File:** `src/memory/sqlite.ts` (wrapper)

### Migrations

State-based migrations handle legacy directory transitions, not database schema.

**File:** `src/infra/state-migrations.ts`

---

## File Locations (Absolute Paths)

### Core Gateway

```
/Users/admin/openclaw/src/gateway/server-http.ts
/Users/admin/openclaw/src/gateway/auth.ts
/Users/admin/openclaw/src/gateway/http-common.ts
```

### Plugin System

```
/Users/admin/openclaw/src/plugins/http-registry.ts
/Users/admin/openclaw/src/plugins/registry.ts
/Users/admin/openclaw/src/plugin-sdk/index.ts
```

### Database

```
/Users/admin/openclaw/src/memory/sqlite.ts
/Users/admin/openclaw/src/memory/manager.ts
```

### Examples

```
/Users/admin/openclaw/src/gateway/openai-http.ts
/Users/admin/openclaw/src/slack/http/index.ts
/Users/admin/openclaw/src/gateway/tools-invoke-http.ts
```

---

## Command Reference

```bash
# Run gateway in dev mode
pnpm gateway:dev

# Run tests
pnpm test
pnpm test:watch
pnpm test:e2e

# Build
pnpm build

# Lint & format
pnpm lint
pnpm format:fix

# Plugin management
openclaw plugin install <path>
openclaw plugin status
openclaw status --probe
```

---

## Unresolved Questions from Scout

1. Is there a built-in request ID/correlation ID system?
2. Are there rate-limiting mechanisms for HTTP routes?
3. Is request/response middleware composable?
4. How to stream large responses (files)?
5. Are there built-in webhooks/event delivery retries?

(See full report section 15 for details)

---

## Report Metadata

| Field                | Value                                     |
| -------------------- | ----------------------------------------- |
| Generated            | 2026-02-12                                |
| Project              | openclaw                                  |
| Version              | 2026.2.4                                  |
| Working Directory    | /Users/admin/openclaw                     |
| Total Lines Analyzed | 1,437                                     |
| Files Reviewed       | 40+                                       |
| Entry Points         | 3 (Quick Start, Architecture, File Index) |

---

## Next Steps

1. **Choose your report** based on your use case (see "Entry Points by Use Case" above)
2. **Read the relevant sections** for implementation details
3. **Copy code examples** from Quick Start guide
4. **Test with curl** before integrating
5. **Write unit tests** using Vitest
6. **Check existing examples** (openai-http.ts, slack/http/)

---

## Support Files in Repository

- Config: `src/config/config.ts`, `src/config/paths.ts`
- Logging: `src/logging/subsystem.ts`
- Infrastructure: `src/infra/net.ts`, `src/infra/tailscale.ts`
- Entry: `src/entry.ts`, `src/runtime.ts`

---

## Key Takeaways

✅ HTTP requests use native Node.js (no framework)
✅ Plugin routes are exact-path matches (3rd in priority)
✅ Auth is optional at gateway; implement per-route
✅ Database is SQLite with no ORM
✅ Migrations are state-based (not schema)
✅ Handler chain pattern (first match wins)
✅ Request/Response are native Node types
✅ Tests use Vitest with E2E support

---

**Generated:** 2026-02-12  
**Scout Mode:** Complete Architecture Review  
**Status:** Ready for Implementation
