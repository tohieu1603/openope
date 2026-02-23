# OpenClaw HTTP API - Quick Start Guide

**Generated:** 2026-02-12 | **Use This:** To add new API endpoints to OpenClaw

---

## TL;DR - Add a New Webhook Endpoint in 3 Steps

### Step 1: Create Plugin Handler

```typescript
// my-plugin/src/index.ts
import { registerPluginHttpRoute, OpenClawPluginApi } from "openclaw/plugin-sdk";

export default function initializePlugin(api: OpenClawPluginApi) {
  registerPluginHttpRoute({
    path: "/webhook/github",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }

      // Parse body
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const data = JSON.parse(body);

      // Your logic here
      console.log("GitHub event:", data.action);

      // Send response
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ received: true }));
    },
    pluginId: "my-github-plugin",
  });
}
```

### Step 2: Install Plugin

```bash
openclaw plugin install /path/to/my-plugin
```

### Step 3: Test

```bash
curl -X POST http://localhost:18789/webhook/github \
  -H "Content-Type: application/json" \
  -d '{"action":"opened","pull_request":{}}'
```

**Done!** Your webhook is live at `/webhook/github`.

---

## Common Tasks

### Read Request Headers

```typescript
const userAgent = req.headers["user-agent"];
const contentType = req.headers["content-type"];
const token = req.headers.authorization?.split(" ")[1];
```

### Validate Bearer Token (Auth)

```typescript
import { getBearerToken } from "openclaw/plugin-sdk";

const token = getBearerToken(req);
if (!token || !isValidToken(token)) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return;
}
```

### Stream Response (Server-Sent Events)

```typescript
res.statusCode = 200;
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.write(`data: ${JSON.stringify(chunk1)}\n\n`);
res.write(`data: ${JSON.stringify(chunk2)}\n\n`);
res.end("data: [DONE]\n\n");
```

### Parse URL Query String

```typescript
const url = new URL(req.url ?? "/", "http://localhost");
const page = url.searchParams.get("page") || "1";
const search = url.searchParams.get("q") || "";
```

### Return JSON Error

```typescript
res.statusCode = 400;
res.setHeader("Content-Type", "application/json");
res.end(
  JSON.stringify({
    error: "Invalid input",
    details: "Missing required field: name",
  }),
);
```

### Handle File Upload

```typescript
// Parse multipart form data (you need a library or manual parsing)
const boundary = req.headers["content-type"]?.match(/boundary=([^;]+)/)?.[1];
if (boundary) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
  }
  // Parse body with boundary...
}
```

---

## Architecture Overview

```
Your Plugin HTTP Route
        ↓
    (request arrives)
        ↓
src/gateway/server-http.ts
    (handler chain dispatch)
        ↓
src/gateway/server/plugins-http.ts
    (find matching route)
        ↓
Your Handler Function
    (req, res) => { ... }
```

**Key Facts:**

- Routes are checked in exact path order (no regex/wildcards)
- First matching handler wins
- Plugins are checked AFTER Slack/Hooks but BEFORE OpenAI/Canvas
- No auth enforcement at gateway level (implement in your handler)

---

## File Organization for Custom Plugin

```
my-plugin/
├── package.json
├── src/
│   ├── index.ts              ← Entry point, exports default function
│   ├── handlers/
│   │   ├── webhook.ts        ← HTTP handler logic
│   │   ├── auth.ts           ← Auth/token validation
│   │   └── parser.ts         ← Payload parsing
│   └── types.ts              ← TypeScript types
├── tests/
│   └── webhook.test.ts       ← Tests
└── README.md
```

**Entry point (`src/index.ts`):**

```typescript
import { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { handleWebhook } from "./handlers/webhook.js";

export default function initializePlugin(api: OpenClawPluginApi) {
  api.registerHttpRoute?.({
    path: "/webhook/my-service",
    handler: handleWebhook,
    pluginId: "my-plugin",
  });
}
```

---

## Environment & Configuration

### Access Gateway Config

```typescript
// In your handler, you DON'T have direct access to config
// Use env vars or plugin configuration instead:
const apiKey = process.env.MY_PLUGIN_API_KEY;
```

### Plugin Configuration

```typescript
// In plugin manifest (package.json or plugin.yaml):
{
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string" },
      "webhookSecret": { "type": "string" }
    }
  }
}

// In handler, read via api.config or plugin store:
export default function initializePlugin(api: OpenClawPluginApi) {
  const config = api.config?.["my-plugin"] || {};
  const secret = config.webhookSecret;
}
```

---

## Request Object Reference

**Type:** `IncomingMessage` (Node.js native)

### Common Properties

```typescript
req.method; // "POST", "GET", "PUT", etc.
req.url; // Full URL path: "/webhook/github?page=1"
req.headers; // Object: { "content-type": "application/json", ... }
req.socket.remoteAddress; // Client IP
```

### Reading Body

```typescript
// Option 1: Simple string concatenation
let body = "";
for await (const chunk of req) {
  body += chunk.toString();
}
const data = JSON.parse(body);

// Option 2: Buffer concatenation (better for binary)
const chunks = [];
for await (const chunk of req) {
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks);
const json = JSON.parse(buffer.toString());

// Option 3: Use SDK helper (if available)
// import { readJsonBody } from "./gateway/hooks.js";
// const body = await readJsonBody(req, 1024 * 1024);
```

---

## Response Object Reference

**Type:** `ServerResponse` (Node.js native)

### Common Methods

```typescript
res.statusCode = 200; // Set HTTP status
res.setHeader("name", "value"); // Set header
res.getHeader("name"); // Get header
res.removeHeader("name"); // Remove header
res.end(data); // Send response (final)
res.write(data); // Write chunk (can call multiple times)
res.headersSent; // Boolean: true if headers already sent
```

### Common Patterns

```typescript
// JSON response
res.statusCode = 200;
res.setHeader("Content-Type", "application/json");
res.end(JSON.stringify({ key: "value" }));

// Plain text
res.statusCode = 200;
res.setHeader("Content-Type", "text/plain");
res.end("OK");

// HTML
res.statusCode = 200;
res.setHeader("Content-Type", "text/html; charset=utf-8");
res.end("<h1>Hello</h1>");

// Stream response
res.statusCode = 200;
res.setHeader("Content-Type", "application/octet-stream");
res.write(chunk1);
res.write(chunk2);
res.end();

// Redirect
res.statusCode = 302;
res.setHeader("Location", "https://example.com");
res.end();
```

---

## Testing Your Endpoint

### Manual Test (curl)

```bash
# Start gateway
pnpm gateway:dev

# In another terminal, test endpoint
curl -X POST http://localhost:18789/webhook/github \
  -H "Content-Type: application/json" \
  -d '{"action":"opened"}'

# With auth header
curl -X POST http://localhost:18789/webhook/github \
  -H "Authorization: Bearer token123" \
  -H "Content-Type: application/json" \
  -d '{"action":"opened"}'
```

### Automated Tests (Vitest)

```typescript
// my-plugin/tests/webhook.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleWebhook } from "../src/handlers/webhook.js";

describe("webhook handler", () => {
  it("returns 200 for valid POST", async () => {
    const req = {
      method: "POST",
      url: "/webhook/github",
      headers: { "content-type": "application/json" },
      [Symbol.asyncIterator]: async function* () {
        yield JSON.stringify({ action: "opened" });
      },
    };
    const res = {
      statusCode: undefined,
      headers: {},
      setHeader: vi.fn((key, val) => {
        res.headers[key] = val;
      }),
      end: vi.fn(),
    };

    await handleWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalled();
  });
});
```

---

## Debugging Tips

### Log Request Details

```typescript
handler: async (req, res) => {
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", req.headers);

  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
  }
  console.log("Body:", body);

  // Your logic...
};
```

### Check Gateway Logs

```bash
# View gateway logs in real-time
tail -f ~/.openclaw/logs/gateway.log

# Or run in foreground
pnpm gateway:dev
```

### Verify Plugin Loaded

```bash
openclaw plugin status

# Or in gateway
openclaw status --probe
```

---

## Common Mistakes & Fixes

| Mistake                    | Fix                                                                        |
| -------------------------- | -------------------------------------------------------------------------- |
| Handler doesn't run        | Check path matches exactly (e.g., `/webhook/github` != `/webhook/github/`) |
| 405 Method Not Allowed     | Add method check: `if (req.method !== "POST")`                             |
| Hanging request            | Always call `res.end()` or `res.write()` eventually                        |
| JSON parse error           | Ensure body is valid JSON; use try-catch                                   |
| Headers already sent error | Check `res.headersSent` before calling `setHeader()`                       |
| Auth always fails          | Implement auth in your handler; gateway doesn't enforce it                 |
| Plugin doesn't install     | Ensure package.json has `main` and plugin entry point                      |
| Port already in use        | Change gateway port: `pnpm gateway:dev --port 18790`                       |

---

## Next Steps

1. **Create a simple echo endpoint** (copy-paste code above)
2. **Test with curl** to verify it works
3. **Add request validation** using zod/typebox
4. **Add auth** (bearer token check)
5. **Integrate with external service** (call API, database, etc.)
6. **Write unit tests** (Vitest)
7. **Publish to npm** or distribute locally

---

## Resources

- **Full API Architecture:** `scout-260212-openclaw-http-api-arch.md`
- **File Index:** `scout-260212-file-index.md`
- **Auth Example:** See Gateway auth section in main report
- **Plugin SDK:** `/Users/admin/openclaw/src/plugin-sdk/index.ts`
- **Example Handler:** `/Users/admin/openclaw/src/gateway/openai-http.ts`

---

**Need help?** Check the full scout report for detailed architecture diagrams and advanced patterns.
