// intercept.cjs
// Hook globalThis.fetch to auto-inject API key into Anthropic requests.
// @anthropic-ai/sdk v0.71.2 uses globalThis.fetch (not https.request).
//
// Supports:
//   - OAuth token (sk-ant-oat)  -> Authorization: Bearer ...
//   - API key (sk-ant-api)      -> X-Api-Key: ...
//   - Round-robin key rotation
//   - Auto-refresh keys from server
//   - Error detection (401/402/429)
//
// Usage:
//   KEY_SERVER_URL="http://your-server:3025/proxy/pool" \
//   KEY_SERVER_SECRET="your-secret" \
//   NODE_OPTIONS="--require ./intercept.cjs" \
//   openclaw gateway run

// ================================================================
// SAVE ORIGINAL FETCH BEFORE HOOKING (critical!)
// ================================================================
const originalFetch = globalThis.fetch;

// ================================================================
// KEY POOL - only exists in RAM
// ================================================================
const keys = [];
let idx = 0;

// ================================================================
// CONFIG - read from env vars
// ================================================================
const KEY_SERVER = process.env.KEY_SERVER_URL;
const KEY_SECRET = process.env.KEY_SERVER_SECRET;
const REFRESH_MS = Number(process.env.KEY_REFRESH_MS) || 300000; // 5 min
const TARGETS = ["anthropic.com"];
const LOG_PREFIX = "[intercept]";

// ================================================================
// FETCH KEYS FROM SERVER
// ================================================================
// Uses originalFetch (not hooked) to call key server.
// If we used globalThis.fetch we'd get an infinite loop.
//
// Server response format:
//   { "keys": ["sk-ant-oat01-...", "sk-ant-oat01-...", ...] }
// ================================================================

async function refreshKeys() {
  if (!KEY_SERVER) {
    console.error(LOG_PREFIX + " KEY_SERVER_URL not set. No keys available.");
    return;
  }

  try {
    var res = await originalFetch(KEY_SERVER, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + KEY_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "anthropic" }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(LOG_PREFIX + " Server returned " + res.status);
      return;
    }

    var data = await res.json();

    if (!Array.isArray(data.keys) || data.keys.length === 0) {
      console.error(LOG_PREFIX + " Server returned empty keys");
      return;
    }

    // Replace entire pool
    keys.length = 0;
    keys.push.apply(keys, data.keys);

    console.log(LOG_PREFIX + " Refreshed: " + keys.length + " keys available");
  } catch (err) {
    console.error(LOG_PREFIX + " Refresh failed: " + err.message);
    // Keep old keys in pool if refresh fails
  }
}

// ================================================================
// HELPER: Determine key type and set correct header
// ================================================================

function applyKeyToHeaders(headers, key) {
  // Clear both auth headers first to avoid conflicts
  // (SDK may have set x-api-key or Authorization from config)
  headers.delete("x-api-key");
  headers.delete("Authorization");

  if (key.includes("sk-ant-oat")) {
    // OAuth token -> Authorization: Bearer + ensure oauth beta header
    headers.set("Authorization", "Bearer " + key);

    // SDK only adds oauth beta when it detects a real OAuth token in config.
    // When config has dummy token, SDK omits it. We must inject it.
    var beta = headers.get("anthropic-beta") || "";
    if (!beta.includes("oauth-2025-04-20")) {
      var parts = beta ? beta.split(",") : [];
      parts.unshift("oauth-2025-04-20");
      // Also add claude-code beta if missing (required for OAuth)
      if (!beta.includes("claude-code-")) {
        parts.unshift("claude-code-20250219");
      }
      headers.set("anthropic-beta", parts.join(","));
    }
  } else {
    // API key -> X-Api-Key
    headers.set("x-api-key", key);
  }
}

// ================================================================
// HELPER: Get next key (round-robin)
// ================================================================

function getNextKey() {
  if (keys.length === 0) return null;
  var key = keys[idx % keys.length];
  idx++;
  return key;
}

// ================================================================
// HELPER: Safe log (don't leak full key)
// ================================================================

function safeKeyHint(key) {
  if (key.length < 20) return "***";
  return key.slice(0, 14) + "..." + key.slice(-4);
}

// ================================================================
// HOOK globalThis.fetch
// ================================================================

globalThis.fetch = async function (input, init) {
  // --- Determine URL ---
  var url = "";
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else if (input instanceof Request) {
    url = input.url;
  }

  // --- Check if target ---
  var isTarget = TARGETS.some(function (t) { return url.includes(t); });

  // DEBUG: log all headers SDK sends to Anthropic
  if (isTarget) {
    var debugHeaders;
    if (init && init.headers instanceof Headers) {
      debugHeaders = new Headers(init.headers);
    } else if (init && init.headers && typeof init.headers === "object") {
      debugHeaders = new Headers(init.headers);
    } else {
      debugHeaders = new Headers();
    }
    var headerList = [];
    debugHeaders.forEach(function (val, name) {
      if (name.toLowerCase() === "authorization" || name.toLowerCase() === "x-api-key") {
        headerList.push(name + ": " + val.slice(0, 20) + "...");
      } else {
        headerList.push(name + ": " + val);
      }
    });
    console.log(LOG_PREFIX + " [DEBUG-ALL] " + url.split("?")[0] + "\n  " + headerList.join("\n  "));
  }

  if (isTarget && keys.length > 0) {
    var key = getNextKey();

    if (key) {
      // Build new headers from existing
      var headers;
      if (init && init.headers instanceof Headers) {
        headers = new Headers(init.headers);
      } else if (init && init.headers && typeof init.headers === "object") {
        headers = new Headers(init.headers);
      } else {
        headers = new Headers();
      }

      // Apply correct key type
      applyKeyToHeaders(headers, key);

      // Log
      var keyIndex = (idx - 1) % keys.length;
      console.log(
        LOG_PREFIX + " " + url.split("?")[0] +
        " -> key " + keyIndex +
        " (" + safeKeyHint(key) + ")"
      );

      // Create new init
      init = Object.assign({}, init, { headers: headers });

      // If input is Request object, recreate it
      if (input instanceof Request) {
        input = new Request(input, { headers: headers });
      }
    }
  }

  // --- Call original fetch ---
  var response = await originalFetch.call(this, input, init);

  // --- Detect key errors ---
  if (isTarget && !response.ok) {
    var errKeyIndex = keys.length > 0 ? ((idx - 1) % keys.length) : -1;

    switch (response.status) {
      case 401:
      case 403:
        console.error(
          LOG_PREFIX + " Key " + errKeyIndex + " AUTH ERROR (" + response.status + ")"
        );
        break;
      case 429:
        console.warn(
          LOG_PREFIX + " Key " + errKeyIndex + " RATE LIMITED (429)"
        );
        break;
      case 402:
        console.error(
          LOG_PREFIX + " Key " + errKeyIndex + " NO CREDIT (402)"
        );
        break;
    }
  }

  return response;
};

// ================================================================
// STARTUP
// ================================================================

// Fetch keys on first load
refreshKeys();

// Periodic refresh
setInterval(refreshKeys, REFRESH_MS);

// Log
console.log(LOG_PREFIX + " ==========================================");
console.log(LOG_PREFIX + " API Key Intercept loaded");
console.log(LOG_PREFIX + " Server: " + (KEY_SERVER || "NOT SET"));
console.log(LOG_PREFIX + " Refresh: " + (REFRESH_MS / 1000) + "s");
console.log(LOG_PREFIX + " Targets: " + TARGETS.join(", "));
console.log(LOG_PREFIX + " ==========================================");
