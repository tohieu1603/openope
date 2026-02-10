# API Key Intercept - Hướng dẫn chi tiết

## Mục đích

Tự động gắn API key (OAuth token hoặc API key thường) vào request gửi đến Anthropic **mà không sửa bất kỳ file nào trong OpenClaw**. Key được lấy từ server riêng, chỉ tồn tại trong RAM.

---

## Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│ Máy chạy OpenClaw                                                   │
│                                                                     │
│  NODE_OPTIONS="--require ./intercept.cjs"                           │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────┐                                                   │
│  │ intercept.cjs │──── originalFetch ───→ Key Server (lấy key)      │
│  │ (hook fetch)  │                        ↓                         │
│  │               │◄─── keys[] ──────────── (lưu RAM)                │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         │ thay globalThis.fetch                                     │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │   OpenClaw    │                                                   │
│  │   Gateway     │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         │ gọi fetch() (đã bị hook)                                  │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │  pi-ai SDK    │                                                   │
│  │  @anthropic-ai/sdk v0.71.2                                       │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         │ fetch("https://api.anthropic.com/v1/messages")             │
│         │ intercept bắt được → gắn key vào header                   │
│         ▼                                                           │
│  Request đi THẲNG đến Anthropic (có key rồi)                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Key Server (máy riêng)                                              │
│                                                                     │
│  key-server.js                                                      │
│  ├── Lưu trữ key pool                                              │
│  ├── Xác thực caller (Bearer token)                                 │
│  └── Trả key qua HTTP API                                          │
│                                                                     │
│  Key không bao giờ rời server ngoài qua HTTPS response              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tại sao hook `globalThis.fetch` mà không phải `https.request`

### Chuỗi gọi thực tế trong OpenClaw

```
OpenClaw Gateway
  │
  ▼
src/agents/pi-embedded-runner/run/attempt.ts
  │  import { streamSimple } from "@mariozechner/pi-ai"
  │
  ▼
@mariozechner/pi-ai v0.51.1 (node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js)
  │  import Anthropic from "@anthropic-ai/sdk"
  │  const client = new Anthropic({ apiKey, baseURL: model.baseUrl })
  │  client.messages.stream(params)
  │
  ▼
@anthropic-ai/sdk v0.71.2 (node_modules/@anthropic-ai/sdk/internal/shims.mjs)
  │  export function getDefaultFetch() {
  │    if (typeof fetch !== 'undefined') {
  │      return fetch;     ◄── DÙNG globalThis.fetch
  │    }
  │  }
  │
  ▼
globalThis.fetch("https://api.anthropic.com/v1/messages", { headers: {...} })
```

**Kết luận**: SDK dùng `globalThis.fetch`, **KHÔNG** dùng `https.request`. Hook `https.request` sẽ không hoạt động.

---

## Hai loại key và header tương ứng

### OAuth token (Claude Code setup-token)

```
Key format:    sk-ant-oat01-...
Header:        Authorization: Bearer sk-ant-oat01-...
Tạo bởi:       claude setup-token
```

SDK xử lý (client.mjs dòng 125-129):
```javascript
async bearerAuth(opts) {
    if (this.authToken == null) return undefined;
    return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
}
```

pi-ai tạo client (anthropic.js dòng 352-359):
```javascript
const client = new Anthropic({
    apiKey: null,
    authToken: apiKey,     // ← OAuth token truyền vào authToken
    baseURL: model.baseUrl,
});
```

### API key thường

```
Key format:    sk-ant-api03-...
Header:        X-Api-Key: sk-ant-api03-...
Tạo bởi:       Anthropic Console
```

SDK xử lý (client.mjs dòng 119-123):
```javascript
async apiKeyAuth(opts) {
    if (this.apiKey == null) return undefined;
    return buildHeaders([{ 'X-Api-Key': this.apiKey }]);
}
```

pi-ai tạo client (anthropic.js dòng 366-372):
```javascript
const client = new Anthropic({
    apiKey,                // ← API key truyền vào apiKey
    baseURL: model.baseUrl,
});
```

---

## File cần tạo

### Tổng quan

```
KHÔNG SỬA:
  openclaw.mjs           ← entry point, không đổi
  src/                   ← source code, không đổi
  package.json           ← dependencies, không đổi
  ~/.openclaw/openclaw.json  ← config, không đổi

TẠO MỚI:
  Máy OpenClaw:
    intercept.cjs        ← hook globalThis.fetch

  Máy Key Server:
    key-server.js        ← API trả key
```

---

## File 1: `intercept.cjs` (máy chạy OpenClaw)

Đặt tại: `e:\newbot\openclaw\intercept.cjs`

```javascript
// intercept.cjs
// Hook globalThis.fetch để tự động gắn API key vào request đến Anthropic.
// @anthropic-ai/sdk v0.71.2 dùng globalThis.fetch (không dùng https.request).
//
// Hỗ trợ:
//   - OAuth token (sk-ant-oat)  → Authorization: Bearer ...
//   - API key (sk-ant-api)      → X-Api-Key: ...
//   - Round-robin key rotation
//   - Tự động refresh key từ server
//   - Phát hiện key lỗi (401/402/429)
//
// Chạy:
//   KEY_SERVER_URL="http://your-server:9000" \
//   KEY_SERVER_SECRET="your-secret" \
//   NODE_OPTIONS="--require ./intercept.cjs" \
//   openclaw gateway run

// ================================================================
// LƯU FETCH GỐC TRƯỚC KHI HOOK (quan trọng!)
// ================================================================
const originalFetch = globalThis.fetch;

// ================================================================
// KEY POOL - chỉ tồn tại trong RAM
// ================================================================
const keys = [];
let idx = 0;

// ================================================================
// CẤU HÌNH - đọc từ env var
// ================================================================
const KEY_SERVER = process.env.KEY_SERVER_URL;        // URL key server
const KEY_SECRET = process.env.KEY_SERVER_SECRET;      // Token xác thực
const REFRESH_MS = Number(process.env.KEY_REFRESH_MS) || 300000; // 5 phút
const TARGETS = ["anthropic.com"];                     // Domain cần inject
const LOG_PREFIX = "[intercept]";

// ================================================================
// FETCH KEY TỪ SERVER
// ================================================================
// Dùng originalFetch (không bị hook) để gọi key server.
// Nếu dùng globalThis.fetch sẽ bị vòng lặp vô hạn.
//
// Flow:
//   intercept.cjs khởi động
//     → originalFetch(KEY_SERVER) lấy key
//     → lưu vào keys[] (RAM)
//     → refresh mỗi REFRESH_MS
//
// Server trả format:
//   { "keys": ["sk-ant-oat01-...", "sk-ant-oat01-...", ...] }
// ================================================================

async function refreshKeys() {
  if (!KEY_SERVER) {
    console.error(`${LOG_PREFIX} KEY_SERVER_URL not set. No keys available.`);
    return;
  }

  try {
    const res = await originalFetch(KEY_SERVER, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + KEY_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "anthropic" }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`${LOG_PREFIX} Server returned ${res.status}`);
      return;
    }

    const data = await res.json();

    if (!Array.isArray(data.keys) || data.keys.length === 0) {
      console.error(`${LOG_PREFIX} Server returned empty keys`);
      return;
    }

    // Thay toàn bộ pool
    keys.length = 0;
    keys.push(...data.keys);

    console.log(`${LOG_PREFIX} Refreshed: ${keys.length} keys available`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Refresh failed: ${err.message}`);
    // Giữ key cũ trong pool nếu refresh thất bại
  }
}

// ================================================================
// HELPER: Xác định loại key và gắn header tương ứng
// ================================================================
//
// OAuth token (sk-ant-oat01-...):
//   SDK tạo client với: new Anthropic({ authToken: key })
//   SDK gửi header:     Authorization: Bearer sk-ant-oat01-...
//
// API key (sk-ant-api03-...):
//   SDK tạo client với: new Anthropic({ apiKey: key })
//   SDK gửi header:     X-Api-Key: sk-ant-api03-...
//
// intercept ghi đè header đúng loại.
// ================================================================

function applyKeyToHeaders(headers, key) {
  if (key.includes("sk-ant-oat")) {
    // OAuth token → Authorization: Bearer
    headers.set("Authorization", "Bearer " + key);
  } else {
    // API key thường → X-Api-Key
    headers.set("x-api-key", key);
  }
}

// ================================================================
// HELPER: Lấy key tiếp theo (round-robin)
// ================================================================

function getNextKey() {
  if (keys.length === 0) return null;
  const key = keys[idx % keys.length];
  idx++;
  return key;
}

// ================================================================
// HELPER: Log an toàn (không lộ full key)
// ================================================================

function safeKeyHint(key) {
  if (key.length < 20) return "***";
  return key.slice(0, 14) + "..." + key.slice(-4);
}

// ================================================================
// HOOK globalThis.fetch
// ================================================================
//
// Mọi fetch() call trong process đều đi qua đây.
// Chỉ can thiệp khi URL chứa domain trong TARGETS.
//
// Flow khi OpenClaw gọi Anthropic:
//   1. pi-ai gọi client.messages.stream()
//   2. @anthropic-ai/sdk gọi globalThis.fetch(url, init)
//   3. Hàm hook bắt được
//   4. Kiểm tra URL có chứa "anthropic.com"?
//   5. Có → lấy key từ pool → gắn vào header → gọi fetch gốc
//   6. Không → gọi fetch gốc bình thường (không can thiệp)
// ================================================================

globalThis.fetch = async function (input, init) {
  // --- Xác định URL ---
  let url = "";
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else if (input instanceof Request) {
    url = input.url;
  }

  // --- Kiểm tra có phải target? ---
  var isTarget = TARGETS.some(function (t) { return url.includes(t); });

  if (isTarget && keys.length > 0) {
    var key = getNextKey();

    if (key) {
      // Tạo headers mới từ headers cũ
      var headers;
      if (init && init.headers instanceof Headers) {
        headers = new Headers(init.headers);
      } else if (init && init.headers && typeof init.headers === "object") {
        headers = new Headers(init.headers);
      } else {
        headers = new Headers();
      }

      // Gắn key đúng loại
      applyKeyToHeaders(headers, key);

      // Log
      var keyIndex = (idx - 1) % keys.length;
      console.log(
        LOG_PREFIX + " " + url.split("?")[0] +
        " -> key " + keyIndex +
        " (" + safeKeyHint(key) + ")"
      );

      // Tạo init mới
      init = Object.assign({}, init, { headers: headers });

      // Nếu input là Request object, tạo lại
      if (input instanceof Request) {
        input = new Request(input, { headers: headers });
      }
    }
  }

  // --- Gọi fetch gốc ---
  var response = await originalFetch.call(this, input, init);

  // --- Phát hiện key lỗi ---
  if (isTarget && !response.ok) {
    var keyIndex = keys.length > 0 ? ((idx - 1) % keys.length) : -1;

    switch (response.status) {
      case 401:
      case 403:
        console.error(
          LOG_PREFIX + " Key " + keyIndex + " AUTH ERROR (" + response.status + ")"
        );
        break;
      case 429:
        console.warn(
          LOG_PREFIX + " Key " + keyIndex + " RATE LIMITED (429)"
        );
        break;
      case 402:
        console.error(
          LOG_PREFIX + " Key " + keyIndex + " NO CREDIT (402)"
        );
        break;
    }
  }

  return response;
};

// ================================================================
// KHỞI ĐỘNG
// ================================================================

// Fetch key lần đầu
refreshKeys();

// Refresh định kỳ
setInterval(refreshKeys, REFRESH_MS);

// Log
console.log(LOG_PREFIX + " ==========================================");
console.log(LOG_PREFIX + " API Key Intercept loaded");
console.log(LOG_PREFIX + " Server: " + (KEY_SERVER || "NOT SET"));
console.log(LOG_PREFIX + " Refresh: " + (REFRESH_MS / 1000) + "s");
console.log(LOG_PREFIX + " Targets: " + TARGETS.join(", "));
console.log(LOG_PREFIX + " ==========================================");
```

---

## File 2: `key-server.js` (máy key server)

Đặt tại: máy server riêng của bạn

```javascript
// key-server.js
// Server quản lý và phân phối API key cho các máy OpenClaw.
//
// Chạy:
//   node key-server.js
//
// API:
//   POST /
//   Headers: Authorization: Bearer <secret>
//   Body:    { "provider": "anthropic" }
//   Response: { "keys": ["sk-ant-oat01-...", ...] }

const http = require("node:http");

// ================================================================
// CẤU HÌNH
// ================================================================

const PORT = Number(process.env.KEY_SERVER_PORT) || 9000;

// Secret để xác thực caller
const SECRET = process.env.KEY_SERVER_SECRET || "change-me-in-production";

// Key pool - thêm/bớt key ở đây
const KEY_POOL = {
  anthropic: [
    // OAuth tokens (Claude Code setup-token)
    "sk-ant-oat01-token1...",
    "sk-ant-oat01-token2...",
    // Hoặc API key thường
    // "sk-ant-api03-key1...",
  ],
  // Mở rộng cho provider khác
  // openai: ["sk-oai-..."],
  // google: ["AIza..."],
};

// ================================================================
// SERVER
// ================================================================

const server = http.createServer(function (req, res) {
  // CORS headers (nếu cần)
  res.setHeader("Content-Type", "application/json");

  // Chỉ chấp nhận POST
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Xác thực
  var auth = req.headers.authorization || "";
  if (auth !== "Bearer " + SECRET) {
    console.log("[key-server] Unauthorized request from " + (req.socket.remoteAddress || "unknown"));
    res.writeHead(403);
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  // Đọc body
  var body = "";
  req.on("data", function (chunk) { body += chunk; });
  req.on("end", function () {
    try {
      var data = JSON.parse(body);
      var provider = data.provider || "anthropic";
      var keys = KEY_POOL[provider] || [];

      console.log(
        "[key-server] " + (req.socket.remoteAddress || "unknown") +
        " requested " + provider +
        " -> " + keys.length + " keys"
      );

      res.writeHead(200);
      res.end(JSON.stringify({ keys: keys }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
});

server.listen(PORT, function () {
  console.log("[key-server] ==========================================");
  console.log("[key-server] Key Server running on port " + PORT);
  console.log("[key-server] Providers: " + Object.keys(KEY_POOL).join(", "));
  console.log("[key-server] Keys:");
  for (var provider in KEY_POOL) {
    console.log("  " + provider + ": " + KEY_POOL[provider].length + " keys");
  }
  console.log("[key-server] ==========================================");
});
```

---

## Cách chạy

### Bước 1: Khởi động Key Server (trên máy server)

```bash
KEY_SERVER_SECRET="my-strong-secret-token-abc123" \
KEY_SERVER_PORT=9000 \
node key-server.js
```

Output:
```
[key-server] ==========================================
[key-server] Key Server running on port 9000
[key-server] Providers: anthropic
[key-server] Keys:
  anthropic: 2 keys
[key-server] ==========================================
```

### Bước 2: Khởi động OpenClaw với intercept (trên máy gateway)

```bash
KEY_SERVER_URL="http://ip-key-server:9000" \
KEY_SERVER_SECRET="my-strong-secret-token-abc123" \
NODE_OPTIONS="--require ./intercept.cjs" \
openclaw gateway run
```

Output:
```
[intercept] ==========================================
[intercept] API Key Intercept loaded
[intercept] Server: http://ip-key-server:9000
[intercept] Refresh: 300s
[intercept] Targets: anthropic.com
[intercept] ==========================================
[intercept] Refreshed: 2 keys available
OpenClaw gateway running on port 18789...
```

### Bước 3: Khi có request

```
[intercept] https://api.anthropic.com/v1/messages -> key 0 (sk-ant-oat01-to...en1)
[intercept] https://api.anthropic.com/v1/messages -> key 1 (sk-ant-oat01-to...en2)
[intercept] https://api.anthropic.com/v1/messages -> key 0 (sk-ant-oat01-to...en1)  ← xoay vòng
```

---

## Flow chi tiết từng bước

```
BƯỚC 1: Node.js khởi động
  │
  │  NODE_OPTIONS="--require ./intercept.cjs"
  │  Node load intercept.cjs TRƯỚC mọi thứ khác
  │
  ▼
BƯỚC 2: intercept.cjs chạy
  │
  ├── Lưu originalFetch = globalThis.fetch
  ├── Thay globalThis.fetch = hàm hook
  ├── Gọi refreshKeys() → originalFetch(KEY_SERVER) lấy key
  ├── Key lưu vào keys[] (RAM)
  └── Đặt setInterval refresh mỗi 5 phút
  │
  ▼
BƯỚC 3: OpenClaw khởi động
  │
  │  openclaw.mjs → dist/entry.js → gateway server
  │  OpenClaw KHÔNG BIẾT intercept tồn tại
  │
  ▼
BƯỚC 4: Có tin nhắn từ WhatsApp/Telegram/...
  │
  ▼
BƯỚC 5: OpenClaw gọi AI
  │
  │  src/agents/pi-embedded-runner/run/attempt.ts
  │    → streamSimple() từ @mariozechner/pi-ai
  │
  ▼
BƯỚC 6: pi-ai tạo Anthropic client
  │
  │  @mariozechner/pi-ai/dist/providers/anthropic.js
  │
  │  Nếu token là sk-ant-oat (OAuth):
  │    new Anthropic({ apiKey: null, authToken: token, baseURL: ... })
  │
  │  Nếu token là sk-ant-api (API key):
  │    new Anthropic({ apiKey: key, baseURL: ... })
  │
  ▼
BƯỚC 7: SDK gọi fetch
  │
  │  @anthropic-ai/sdk v0.71.2
  │  shims.mjs: getDefaultFetch() → return globalThis.fetch
  │  client.mjs: fetch(baseURL + "/v1/messages", { headers: { ... } })
  │
  │  Nhưng globalThis.fetch ĐÃ BỊ THAY bởi intercept!
  │
  ▼
BƯỚC 8: Hàm hook bắt được
  │
  │  URL = "https://api.anthropic.com/v1/messages"
  │  ├── Có chứa "anthropic.com"? → CÓ
  │  ├── Lấy key tiếp theo từ keys[]
  │  ├── Key là sk-ant-oat? → gắn Authorization: Bearer ...
  │  ├── Key là sk-ant-api? → gắn X-Api-Key: ...
  │  └── Gọi originalFetch() với headers mới
  │
  ▼
BƯỚC 9: Request đi đến Anthropic
  │
  │  fetch("https://api.anthropic.com/v1/messages", {
  │    headers: {
  │      "Authorization": "Bearer sk-ant-oat01-...",  ← key thật từ server
  │      "anthropic-version": "2023-06-01",
  │      "content-type": "application/json",
  │      ...
  │    },
  │    body: '{"model":"claude-opus-4-5","messages":[...]}'
  │  })
  │
  ▼
BƯỚC 10: Anthropic xử lý → response stream
  │
  ▼
BƯỚC 11: Response về OpenClaw → trả lời user
```

---

## Env vars

| Biến | Bắt buộc | Mô tả | Ví dụ |
|------|----------|-------|-------|
| `KEY_SERVER_URL` | Có | URL key server | `http://192.168.1.100:9000` |
| `KEY_SERVER_SECRET` | Có | Token xác thực | `my-secret-abc123` |
| `KEY_REFRESH_MS` | Không | Chu kỳ refresh (ms) | `300000` (5 phút) |
| `NODE_OPTIONS` | Có | Load intercept | `--require ./intercept.cjs` |

---

## Bảo mật

### Đạt được

- Key không nằm trong config OpenClaw
- Key không nằm trên disk máy OpenClaw (chỉ trong RAM)
- Key tự xóa khi process chết
- Server xác thực caller bằng secret token
- Log không hiển thị full key (chỉ 14 ký tự đầu + 4 cuối)
- Round-robin tự động phân tải key

### Rủi ro còn lại

- Key tồn tại trong RAM máy OpenClaw → root user có thể dump
- Kết nối đến key server nếu không dùng HTTPS → key lộ trên network
- Key server chết → hết key sau khi pool hiện tại dùng hết

### Khuyến nghị

- Dùng HTTPS cho key server trong production
- Đặt key server trong mạng nội bộ (VPN/Tailscale)
- Giới hạn IP được phép gọi key server
- Monitor log để phát hiện key lỗi sớm

---

## So sánh các phương án

| | Config file | intercept.cjs | Proxy (baseUrl) |
|---|---|---|---|
| Sửa code OpenClaw | Không | Không | Không |
| Key trên disk client | **Có** | Không | Không |
| Key trong RAM client | Có | **Có** | Không |
| Key trên network | Không | Có (fetch) | Có (mỗi request) |
| Độ phức tạp | Thấp | Trung bình | Trung bình |
| Latency thêm | 0 | ~0 (key đã có trong RAM) | +1 hop mỗi request |
| Round-robin | Có sẵn (OpenClaw) | Tự implement | Tự implement |
| Failover/cooldown | Có sẵn (OpenClaw) | Cơ bản (log) | Tự implement |
