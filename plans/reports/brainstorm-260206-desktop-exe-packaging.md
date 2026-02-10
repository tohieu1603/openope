# Brainstorm: Build Agent Operis as Desktop .exe

**Date:** 2026-02-06
**Status:** Finalized

---

## 1. Problem Statement

Build the current web app (NodeJS gateway + Lit frontend + WebSocket + Cloudflare Tunnel) into a standalone Windows `.exe` with code protection. App must include WhatsApp, Telegram, Zalo channels and auto-start on Windows boot.

---

## 2. User Requirements (Confirmed)

| # | Question | Answer |
|---|---|---|
| 1 | Channel extensions needed | WhatsApp, Telegram, Zalo |
| 2 | Tunnel provider | Cloudflare Tunnel (`cloudflared`) |
| 3 | .exe format | **Installer (NSIS)** - recommended, see section 5 |
| 4 | Startup behavior | Auto-start on Windows login |

---

## 3. Current Codebase Analysis

### What already exists:

| Component | Stack | Location | Desktop-ready? |
|---|---|---|---|
| **Gateway (backend)** | Node.js + Hono + WS | `src/gateway/` | YES - binds `127.0.0.1:18789` |
| **Client-Web (UI)** | Lit + Vite | `client-web/` | YES - standalone, connects via WS |
| **WhatsApp ext** | Baileys | `extensions/whatsapp/` | YES - pure JS, no extra native deps |
| **Telegram ext** | grammY | `extensions/telegram/` | YES - pure JS |
| **Zalo ext** | undici HTTP | `extensions/zalo/` | YES - pure JS |
| **Windows daemon** | schtasks | `src/daemon/schtasks.ts` | YES - auto-start on login exists |
| **Device auth** | Ed25519 | `src/gateway/device-auth.ts` + `client-web/` | YES |
| **Build pipeline** | tsdown + Vite | `tsdown.config.ts` | YES - produces `dist/` |

### NOT in codebase (need to add):
- **Cloudflare Tunnel integration** - `cloudflared` binary not bundled/managed
- **Electron wrapper** - no `apps/windows-desktop/` exists
- **Cloudflared process management** - spawn/monitor/restart

### Native deps impact for channels:

| Dep | Used by | Risk for Electron |
|---|---|---|
| `@whiskeysockets/baileys` | WhatsApp | LOW - uses protobufjs (has native optional, JS fallback works) |
| `grammy` | Telegram | NONE - pure JS |
| `undici` | Zalo | NONE - pure JS (built into Node 22) |
| `sharp` | Core (image processing) | MEDIUM - needs Electron-compatible prebuild |
| `sqlite-vec` | Memory/RAG | MEDIUM - native addon, may need rebuild |
| `@lydell/node-pty` | Terminal | HIGH - can **exclude** from desktop build |
| `playwright-core` | Browser automation | **EXCLUDE** - not needed in desktop |

---

## 4. Architecture Decision

### Recommended: Electron All-in-one + NSIS Installer

```
[Windows Boot]
    |
    v
[Electron Main Process]
    |
    ├── spawn → [Gateway Node.js] (127.0.0.1:18789)
    |              ├── WhatsApp (Baileys WS)
    |              ├── Telegram (grammY HTTP)
    |              └── Zalo (undici HTTP)
    |
    ├── spawn → [cloudflared tunnel] (outbound to CF edge)
    |              └── Public URL → server public goi vao
    |
    └── render → [BrowserWindow] (client-web Lit UI)
                   └── ws://127.0.0.1:18789
```

### Why Installer (NSIS) not single .exe:

| Criteria | Single .exe (portable) | Installer (NSIS) |
|---|---|---|
| Auto-start on boot | Must self-register schtasks | Installer sets registry/startup |
| `cloudflared` binary | Must extract at runtime | Installed to proper location |
| Native modules (.node) | Must unpack to temp | Installed to `%APPDATA%` |
| Auto-update | Complex self-replacement | electron-updater native support |
| Uninstall cleanly | Manual cleanup | Add/Remove Programs |
| User trust | "Downloaded .exe" = scary | Signed installer = trusted |
| File size | Same (~200MB) | Same but compressed |

**Verdict:** Installer wins on every dimension for "auto-start + cloudflared + updatable" requirements.

---

## 5. Cloudflare Tunnel Integration Plan

### Current state:
- Codebase has `cloudflare-ai-gateway.ts` (LLM proxy, NOT tunnel)
- SSH tunnel exists (`src/infra/ssh-tunnel.ts`) - pattern reusable
- Tailscale funnel exists (`src/gateway/server-tailscale.ts`) - pattern reusable

### What to build:

```
src/infra/cloudflare-tunnel.ts    # Spawn/manage cloudflared process
src/gateway/server-cloudflare.ts  # Gateway integration (like server-tailscale.ts)
```

**cloudflared integration approach:**
1. Bundle `cloudflared.exe` in Electron resources (or download on first run)
2. On app start: `cloudflared tunnel run --token <CF_TUNNEL_TOKEN>`
3. Monitor process health, auto-restart on crash
4. Report tunnel URL to gateway → UI shows status

**Config needed:**
```yaml
# In openclaw config
tunnel:
  provider: cloudflare
  token: "eyJ..."  # Cloudflare Tunnel token from dashboard
```

**Key advantage:** Cloudflare Tunnel with named tunnel = **fixed domain** (e.g., `gateway.yourdomain.com`). Your public server always knows where to call.

---

## 6. Project Structure

```
apps/windows-desktop/
  package.json              # Electron + electron-builder deps
  electron-builder.yml      # NSIS installer config
  src/
    main.ts                 # Main process: lifecycle, tray, auto-start
    preload.ts              # Security bridge
    gateway-manager.ts      # Spawn/monitor gateway process
    tunnel-manager.ts       # Spawn/monitor cloudflared
    auto-launch.ts          # Windows startup registry
  resources/
    icon.ico
    cloudflared.exe          # Bundled CF tunnel binary (~30MB)
```

### Electron main process flow:

```
1. App start (or Windows boot → auto-launch)
   ↓
2. Show splash / tray icon (loading)
   ↓
3. Spawn gateway process (node dist/entry.js gateway)
   ↓
4. Wait for health: GET http://127.0.0.1:18789/api/health
   ↓
5. Spawn cloudflared: cloudflared tunnel run --token $TOKEN
   ↓
6. Open BrowserWindow → load client-web dist/
   ↓
7. Tray icon: running | tunnel status | channels status
   ↓
8. [Close window] → minimize to tray (gateway + tunnel keep running)
   ↓
9. [Quit from tray] → graceful shutdown: tunnel → gateway → exit
```

---

## 7. Code Protection Strategy

### Phase 1 (MVP):

| Layer | Protection | Effort |
|---|---|---|
| Frontend (Lit) | Vite minify + tree-shake | FREE (already done) |
| Gateway (Node) | tsdown bundle = single file | FREE (already done) |
| ASAR | Electron archive packaging | FREE (electron-builder default) |
| Sourcemaps | Remove from production build | 5 min |
| Secrets | **No hardcoded secrets** - token from config/server | Design discipline |

### Phase 2 (hardening):

| Layer | Protection | Effort |
|---|---|---|
| JS obfuscation | `javascript-obfuscator` on dist/ | 1-2 days |
| V8 bytecode | `bytenode` or Node SEA snapshot | 1 week |
| Code signing | Windows Authenticode cert ($200-400/yr) | 1 day setup |
| Cloudflare token | Encrypted at rest, decrypted in memory | 1-2 days |

### Architectural security (already in place):
- Device auth with Ed25519 keypair
- Server-side token validation
- Gateway requires auth handshake
- Channels authenticate via external providers (WA/TG/Zalo tokens)

**Bottom line:** Even if someone extracts all JS from .exe, they can't impersonate your device or access your channels without the auth tokens stored in user's `%APPDATA%`.

---

## 8. Build Pipeline

```bash
# 1. Build gateway
pnpm build                    # tsdown → dist/

# 2. Build client-web
cd client-web && pnpm build   # Vite → dist/control-ui/

# 3. Build Electron app
cd apps/windows-desktop
pnpm install
pnpm build                    # electron-builder → .exe installer

# Output: apps/windows-desktop/dist/AgentOperis-Setup-x.x.x.exe
```

### electron-builder.yml (key config):

```yaml
appId: com.operis.agent
productName: Agent Operis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
asar: true
asarUnpack:
  - "**/*.node"            # Native modules must be unpacked
  - "**/cloudflared.exe"   # Tunnel binary
extraResources:
  - from: "../../dist"
    to: "gateway"
  - from: "../../client-web/dist"
    to: "client-web"
  - from: "resources/cloudflared.exe"
    to: "cloudflared.exe"
win:
  target: nsis
  icon: resources/icon.ico
```

---

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `sharp` native rebuild for Electron | MEDIUM | Use `sharp` with prebuild-install; test early |
| `sqlite-vec` native addon | MEDIUM | Test rebuild; fallback: disable memory/RAG in desktop |
| `node-pty` incompatible | HIGH | **Exclude** from desktop build - not needed for channels |
| `cloudflared.exe` size (~30MB) | LOW | Accept; total ~230MB |
| Windows Defender flagging unsigned .exe | MEDIUM | Code sign in Phase 2; distribute via trusted channel |
| Cloudflare Tunnel token exposure | MEDIUM | Encrypt at rest; token in `%APPDATA%`, not in code |
| Auto-start permissions | LOW | NSIS installer handles registry entry |
| WhatsApp QR re-auth | LOW | Existing flow works; auth stored in `%APPDATA%` |

---

## 10. Phase Roadmap

### Phase 1: MVP (2-3 weeks)
- [ ] Create `apps/windows-desktop/` Electron project
- [ ] Gateway manager: spawn + health check + restart
- [ ] Cloudflare tunnel manager: spawn + monitor
- [ ] BrowserWindow loads client-web build
- [ ] System tray with status + quit
- [ ] Auto-start via Windows registry (or reuse existing schtasks)
- [ ] NSIS installer via electron-builder
- [ ] Test: WhatsApp + Telegram + Zalo channels work

### Phase 2: Stability (1-2 weeks)
- [ ] Auto-update via electron-updater
- [ ] Crash recovery (gateway/tunnel auto-restart)
- [ ] Logging to `%APPDATA%/AgentOperis/logs/`
- [ ] Tray menu: show logs, restart gateway, reconnect tunnel

### Phase 3: Security (1 week)
- [ ] JS obfuscation on gateway bundle
- [ ] Remove all sourcemaps
- [ ] Encrypt Cloudflare tunnel token at rest
- [ ] Windows code signing certificate

---

## 11. Key Insights

1. **3 channel extensions (WA/TG/Zalo) are all pure JS** - no extra native dep headaches
2. **Cloudflare Tunnel is NOT in codebase yet** - need new `cloudflare-tunnel.ts`, but pattern identical to existing `ssh-tunnel.ts` and `server-tailscale.ts`
3. **Windows schtasks daemon already exists** - can reuse for auto-start, or use Electron's `app.setLoginItemSettings()`
4. **macOS native app is the blueprint** - same concept, different platform wrapper
5. **NSIS installer is clearly better** than single .exe for your requirements (auto-start + cloudflared + updates)

---

## No Unresolved Questions

All requirements clarified. Ready to proceed to implementation planning.
