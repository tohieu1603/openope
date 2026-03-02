# Security Audit Analysis — Agent Operis Desktop

**Date:** 2026-02-27 | **Source:** `C:\plans\reports\security-audit-260227-1552-agent-operis.md`
**Status:** Analyzed, pending implementation

---

## Context

Security audit found 15 vulnerabilities (4 CRITICAL, 5 HIGH, 3 MEDIUM, 3 LOW). After re-evaluating in context of a local Electron desktop app, many reported severities are overstated. This report re-prioritizes based on real-world risk.

---

## Re-prioritized Issues

### P0 — Fix First

| # | Issue | Real Risk | Effort | Why |
|---|-------|-----------|--------|-----|
| 8 | Hardcoded API key in `config-preset-byteplus.json` | **HIGH** | 1-2 days | Anyone who installs app can extract `sk_test_anthropic_proxy_2026` → abuse API proxy at `admin.operis.vn` |
| 3 | Zalo session stored plaintext (`~/.operis/credentials/zalozcajs/*.json`) | **HIGH** | 1 day | Copy file = full Zalo account takeover (read/send messages, contacts) |

**Fix approach:**
- #8: Remove API key from preset. After user login, server provisions per-device key.
- #3: Use `electron.safeStorage` (Windows DPAPI) to encrypt before writing. Pattern already exists in `tunnel-manager.ts`.

### P1 — Fix Soon

| # | Issue | Real Risk | Effort | Why |
|---|-------|-----------|--------|-----|
| 1 | Private key plaintext (`~/.operis/identity/device.json`) | MEDIUM | 1 day | Device impersonation. Encrypt via safeStorage. |
| 2 | API keys/tokens plaintext (`operis.json`, `auth-profiles.json`) | MEDIUM | 1 day | Anthropic key theft = API charges. Encrypt via safeStorage. |
| 11 | `Math.random()` for token generation (`onboard-manager.ts:40,195`) | MEDIUM | 5 min | Replace with `crypto.randomBytes(24).toString("hex")` |

### P2 — Quick Wins

| # | Issue | Real Risk | Effort | Fix |
|---|-------|-----------|--------|-----|
| 9 | Spoofed User-Agent in `config-preset-byteplus.json` | LOW | 2 min | Change to `AgentOperis/1.0.0` |
| 10 | `execSync` in `zcajs-client.ts:116` | LOW | 5 min | Use `execFile("open", [qrFile])` instead |
| 5 | No ASAR integrity (`electron-builder.yml`) | MEDIUM | 30 min | Add `asarIntegrity: true` to config |

### P3 — When Needed

| # | Issue | Real Risk | Effort | Notes |
|---|-------|-----------|--------|-------|
| 4 | App not code-signed | HIGH (public dist) | $200-600/yr + cert | Needed for public distribution, defer for internal use |
| 13 | DevTools always on (F12) | LOW | 30 min | Gate behind `!app.isPackaged` |
| 12 | Token in URL query (`main.ts:128`) | LOW | 30 min | Pass via IPC instead |

### Defer — No Action Needed

| # | Issue | Why Defer |
|---|-------|-----------|
| 6 | IPv6 loopback (`::1`) | `::1` IS loopback, not routable externally |
| 7 | Chrome `--no-sandbox` | Required for Zalo automation, enabling would break it |
| 14 | `sandbox: false` in BrowserWindow | Required for preload, contextIsolation already protects |
| 15 | No IPC rate limiting | Local app, renderer is own code |

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `apps/windows-desktop/src/onboard-manager.ts` | `Math.random` → `crypto.randomBytes` (2 places: line 40, 195) |
| `apps/windows-desktop/resources/config-preset-byteplus.json` | Remove hardcoded `apiKey`, change User-Agent |
| `apps/windows-desktop/src/tunnel-manager.ts` | Reference for safeStorage pattern |
| `extensions/zalozcajs/src/zcajs-client.ts` | `execSync` → `execFile` (line 116) |
| `extensions/zalozcajs/src/zcajs-client.ts` | Encrypt credential files before writing |
| `apps/windows-desktop/electron-builder.yml` | Add ASAR integrity |
| `src/config/paths.ts` | May need encrypted credential helper functions |

## safeStorage Pattern (already working)

From `tunnel-manager.ts`:
```typescript
import { safeStorage } from "electron";

// Encrypt
const encrypted = safeStorage.encryptString(token);
fs.writeFileSync(filepath, encrypted); // binary file

// Decrypt
const buf = fs.readFileSync(filepath);
const token = safeStorage.decryptString(buf);
```

Note: safeStorage only works in Electron main process (after `app.isReady()`). Gateway process runs outside Electron — credentials read by gateway must be decrypted by Electron main process first and passed via IPC or env vars.

---

## Estimated Total Effort

| Priority | Items | Total Effort |
|----------|-------|-------------|
| P0 | #8 + #3 | 2-3 days |
| P1 | #1 + #2 + #11 | 1-2 days |
| P2 | #9 + #10 + #5 | 1 hour |
| P3 | #4 + #13 + #12 | varies |

**Recommended order:** P2 quick wins → P0 → P1 → P3
