# Agent Operis — Windows Desktop (Electron + NSIS)

Electron desktop app that bundles the OpenClaw gateway, client-web UI, and Cloudflare tunnel into a single Windows installer.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process (main.ts)                    │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ GatewayMgr   │  │ TunnelMgr│  │ TrayManager  │  │
│  │ (child proc) │  │ (cf'd)   │  │ (system tray)│  │
│  └──────┬───────┘  └────┬─────┘  └──────────────┘  │
│         │               │                           │
│  ┌──────▼───────────────▼──────────────────────┐    │
│  │  BrowserWindow (control-ui / setup.html)    │    │
│  │  preload.ts → IPC bridge                    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** >= 22.12
- **pnpm** (workspace root uses pnpm)
- **Windows** x64 (NSIS target)

## Directory Structure

```
apps/windows-desktop/
├── src/                    # Electron TypeScript source
│   ├── main.ts             # Main process entry point
│   ├── preload.ts          # Preload script (IPC bridge)
│   ├── gateway-manager.ts  # Gateway child process lifecycle
│   ├── onboard-manager.ts  # First-run onboarding
│   ├── tunnel-manager.ts   # Cloudflare tunnel management
│   ├── tray-manager.ts     # System tray icon + menu
│   └── types.ts            # Shared constants & types
├── resources/              # Static assets bundled into installer
│   ├── setup.html          # First-run setup page
│   ├── gateway-package.json# {"type":"module"} for ESM gateway
│   ├── jiti-babel.cjs      # Runtime TS loader for extensions
│   ├── cloudflared.exe     # Cloudflare tunnel binary
│   ├── icon.ico            # App icon
│   └── tray-*.ico          # Tray status icons (green/yellow/red/gray)
├── dist-extensions/        # Pre-compiled plugins (inlined deps)
│   └── memory-core/        # Memory search plugin
├── scripts/
│   └── download-cloudflared.mjs  # Downloads cloudflared.exe
├── bundle-gateway.js       # esbuild: gateway → single file
├── installer.nsh           # NSIS custom uninstall hooks
├── electron-builder.yml    # electron-builder config
├── tsconfig.json           # TypeScript config (→ dist-electron/)
├── package.json            # Electron + builder deps
│
├── dist-electron/          # [generated] tsc output (gitignored)
├── dist-gateway/           # [generated] esbuild bundle (gitignored)
└── release/                # [generated] installer output (gitignored)
    ├── Agent Operis Setup 1.0.0.exe
    └── win-unpacked/       # Unpacked app for testing
```

## Build Steps

### Full build (from scratch)

Run these 4 steps in order from the **repo root**:

```bash
# 1. Build gateway (tsdown → dist/entry.js) + scripts
cd d:\Project\SourceCode\agent.operis
pnpm build

# 2. Build client-web (Vite → dist/control-ui/)
cd client-web
pnpm build
cd ..

# 3. Bundle gateway into single file (esbuild → dist-gateway/entry.js)
cd apps/windows-desktop
node bundle-gateway.js

# 4. Compile Electron TS + build NSIS installer
npx tsc -p tsconfig.json
npx electron-builder --win --config electron-builder.yml
```

Output: `release/Agent Operis Setup 1.0.0.exe` (~100 MB)

### Quick rebuild (after code changes)

| What changed | Command |
|---|---|
| Electron source only (`src/*.ts`) | `npx tsc -p tsconfig.json && npx electron-builder --win --config electron-builder.yml` |
| Client-web UI | `cd ../../client-web && pnpm build && cd ../apps/windows-desktop && npx electron-builder --win --config electron-builder.yml` |
| Gateway source | `cd ../.. && pnpm build && cd apps/windows-desktop && node bundle-gateway.js && npx electron-builder --win --config electron-builder.yml` |
| Everything | Full build (all 4 steps above) |

### One-liner full build

```bash
cd d:\Project\SourceCode\agent.operis && pnpm build && cd client-web && pnpm build && cd ../apps/windows-desktop && node bundle-gateway.js && npx tsc -p tsconfig.json && npx electron-builder --win --config electron-builder.yml
```

## Build Pipeline Detail

```
Step 1: pnpm build (repo root)
  tsdown → dist/entry.js (gateway, chunked ESM)
  + copy hook metadata, build info, CLI compat

Step 2: pnpm build (client-web/)
  Vite → dist/control-ui/index.html + assets/
  Env: VITE_API_BASE_URL from client-web/.env

Step 3: node bundle-gateway.js
  esbuild: dist/entry.js → dist-gateway/entry.js (~33 MB single file)
  - Inlines all npm deps
  - Stubs optional native packages (sharp, better-sqlite3, node-pty, etc.)
  - ESM format, target node22

Step 4a: npx tsc -p tsconfig.json
  src/*.ts → dist-electron/*.js (CommonJS, ES2022)

Step 4b: npx electron-builder --win --config electron-builder.yml
  Packages into NSIS installer:
  - dist-electron/     → app.asar (Electron main process)
  - dist-gateway/      → resources/gateway/ (bundled gateway)
  - dist/control-ui/   → resources/control-ui/ (web UI)
  - dist-extensions/   → resources/extensions/ (plugins)
  - resources/*        → resources/ (static assets)
  - cloudflared.exe    → resources/ (tunnel binary)
```

## Key Design Decisions

### Gateway is ESM, Electron is CJS
- Gateway `entry.js` is ESM (`import`/`export`) — needs `resources/gateway-package.json` with `{"type":"module"}`
- Electron main process is CJS (`require`) — standard for Electron

### Gateway spawned as child process
- `ELECTRON_RUN_AS_NODE=1` makes Electron's bundled Node available
- `process.execPath` used as Node binary (ships Node 22.16 with Electron 35)
- `OPENCLAW_BUNDLED_PLUGINS_DIR` points to packaged extensions

### Token sync flow
- Onboard generates random gateway token → writes to `~/.openclaw/openclaw.json`
- Backend (`admin.operis.vn`) may have a different token for the user
- On login, client-web redirects with `/?token=<backend_token>`
- Electron intercepts (`will-navigate`), syncs token to config if different
- Gateway hot-reloads config automatically — no restart needed

### file:// protocol handling
- Client-web runs from `file://` in Electron (not HTTP)
- `window.location.href = "/?token=xxx"` would navigate to `file:///C:/?token=xxx`
- `will-navigate` handler intercepts and loads correct `control-ui/index.html`
- `gateway.controlUi.allowedOrigins` includes `"file://"` for WebSocket CORS

## Troubleshooting

### "Config validation failed: plugin not found: memory-core"
- `dist-extensions/memory-core/` is missing or empty
- Ensure `dist-extensions/memory-core/index.ts` exists with inlined dependencies (no `openclaw/plugin-sdk` imports)

### Gateway "token_mismatch"
- Token in `~/.openclaw/openclaw.json` differs from what client sends
- Fix: login through client-web UI → token auto-syncs via `will-navigate` handler
- Manual fix: edit `gateway.auth.token` in config to match backend

### White screen after login
- `will-navigate` handler not intercepting the redirect
- Check `dist-electron/main.js` contains `will-navigate` handler
- Rebuild: `npx tsc -p tsconfig.json`

### Gateway fails to start
- Check log: `%APPDATA%/Agent Operis/gateway.log` (or tray → "Open Logs")
- Common: missing `resources/gateway/package.json` with `{"type":"module"}`
- Common: `ELECTRON_RUN_AS_NODE=1` not set in spawn env

### Locked asar file prevents rebuild
- Close running Agent Operis app first
- Or build to a different output dir temporarily
