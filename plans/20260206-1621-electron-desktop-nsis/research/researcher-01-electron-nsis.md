# Electron + NSIS Windows Desktop App: Research Report

**Date:** 2026-02-06
**Target:** Electron latest + electron-builder with Node.js sidecar/child processes
**Platform:** Windows (win32) | Node >= 22 | pnpm 10.23.0

---

## 1. electron-builder NSIS Config for Node.js Sidecars

**extraResources Pattern:**
- `extraResources` copies static files/binaries into the app bundle, automatically included in NSIS installers
- Architecture-specific resources supported via per-target configuration (x64, ia32, arm64)
- Node.js binaries bundled as sidecars must be copied per-architecture since different archs require different builds

**Best Practice:**
```json
{
  "build": {
    "extraResources": ["path/to/node-binary/**/*", "path/to/dist/**/*"],
    "nsis": { /* config */ }
  }
}
```

**Key Insight:** When bundling external Node processes or cloudflared binaries, place them in `extraResources` and resolve at runtime using `app.getAppPath()`. Test architecture-specific paths locally before release.

---

## 2. Electron Process Management

**Official API Recommendation:**
- **UtilityProcess** (modern, Electron 15+) is preferred over `child_process.fork()` for spawning Node.js child processes from main process
- UtilityProcess enables parent-child IPC without exposing Node APIs to renderers; supports MessagePorts with renderer processes
- Designed for untrusted services, CPU-intensive tasks, crash-prone components

**Graceful Shutdown:**
- Close IPC channel to signal child termination; child exits once no connections remain
- Handle 'disconnect' event when IPC closes
- SIGTERM on POSIX; on Windows, ensure process trees are cleaned up explicitly
- **Known Issue:** Unreferenced child processes can prevent Electron from exiting; track all spawned processes and explicitly terminate

**Crash Recovery:**
- Monitor child process exit events; implement retry logic with exponential backoff
- Health check endpoints (HTTP/IPC) periodically verify child liveness
- Store process state; auto-restart on unexpected exits

---

## 3. Electron Auto-Launch on Windows

**setLoginItemSettings vs Registry vs Task Scheduler:**

| Method | Pros | Cons |
|--------|------|------|
| `app.setLoginItemSettings({openAtLogin: true})` | Built-in API, portable | Registry entry not cleaned on uninstall; requires matching args to `getLoginItemSettings()` |
| Registry (manual) | Fine-grained control | Requires admin on some Windows versions; manual cleanup on uninstall |
| Task Scheduler (schtasks) | More reliable; better for admin elevation | More complex; less portable |

**Implementation:** `setLoginItemSettings()` writes to `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`. Ensure NSIS uninstaller cleans registry entry during uninstall to prevent orphaned startup entries.

**NSIS Integration:** Configure `allowElevation`, `allowToChangeInstallationDirectory`, `oneClick`, `perMachine` in electron-builder config. For per-machine install, admin uninstall required to clean registry.

---

## 4. Sharp + Native Node Addons in Electron

**ASAR + Native Modules:**
- Sharp and other native modules must be **unpacked from ASAR** using `asarUnpack` configuration
- electron-builder auto-detects native modules; explicit `asarUnpack: ["**/node_modules/sharp/**/*"]` may be needed for full control
- Electron Forge provides `@electron-forge/plugin-auto-unpack-natives` to automate unpacking

**electron-rebuild:**
- Not required if prebuild binaries exist; electron-builder handles this internally for native modules
- Use `prebuild-install` patterns to fetch prebuilt `.node` binaries matching Electron's Node ABI
- Test locally: verify `.node` binaries are included in app.asar.unpacked after build

**Recent Issues (2025):**
- electron-builder 25.1.8+ may include unnecessary files in `app.asar.unpacked` (source files, READMEs); consider explicit asarUnpack whitelist
- Works reliably with electron-builder 23.6.0+; test version compatibility

---

## 5. ASAR Packaging & Code Protection

**Default ASAR Behavior:**
- ASAR archives entire app code by default; provides obfuscation but not encryption
- Native modules cannot load from inside ASAR (must be unpacked)

**asarUnpack Strategy:**
- Specify modules that require unpacking (sharp, sqlite3, etc.): `"asar": true, "asarUnpack": ["**/node_modules/{sharp,better-sqlite3}/**/*"]`
- Unpack selectively to balance security vs disk footprint; unpacked files are larger but load faster

**Node Gateway Pattern:**
- External Node process (gateway sidecar) runs outside ASAR; bundle via `extraResources` not inside ASAR
- IPC communication between main process and sidecar keeps core app protected
- Runtime discovery: resolve sidecar path from `app.getAppPath()` + `extraResources` subdirectory

---

## Summary Table

| Topic | Recommendation | Priority |
|-------|-----------------|----------|
| **Sidecar Bundling** | Use `extraResources` per-architecture | HIGH |
| **Child Process** | UtilityProcess API + graceful shutdown | HIGH |
| **Auto-Launch** | `setLoginItemSettings()` + NSIS uninstall cleanup | MEDIUM |
| **Sharp/Addons** | asarUnpack explicit whitelist | HIGH |
| **ASAR** | Selective unpacking + external process for gateway | MEDIUM |

---

## Key Takeaways

1. **Node.js sidecars**: Bundle via `extraResources`, not inside ASAR; resolve at runtime using `app.getAppPath()`
2. **Process management**: Prefer UtilityProcess; track all child processes; implement graceful shutdown + health checks
3. **Auto-launch**: setLoginItemSettings writes to registry; ensure NSIS uninstaller cleans it
4. **Native modules**: asarUnpack sharp selectively; verify `.node` binaries post-build
5. **Code protection**: ASAR + selective unpacking + external processes achieves reasonable security

---

## Unresolved Questions

- Specific electron-builder version compatibility with sharp 0.33+? (mention 23.6.0 works, 25.1.8 has issues—test locally)
- cloudflared binary prebuild availability for all Electron-compatible archs (x64, ia32, arm64)?
- Optimal health-check interval for child processes under variable system load?

---

## Sources

- [NSIS - electron-builder](https://www.electron.build/nsis.html)
- [Common Configuration - electron-builder](https://www.electron.build/configuration/nsis.html)
- [electron builder.Interface.NsisOptions](https://www.electron.build/electron-builder.interface.nsisoptions)
- [UtilityProcess | Electron](https://www.electronjs.org/docs/latest/api/utility-process)
- [Process Model | Electron](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Child process | Node.js v25.6.0 Documentation](https://nodejs.org/api/child_process.html)
- [Everything You Wanted To Know About Electron Child Processes](https://www.matthewslipper.com/2019/09/22/everything-you-wanted-electron-child-process.html)
- [app | Electron](https://www.electronjs.org/docs/latest/api/app)
- [Automating Startup of an Electron App on Windows Machines Using Task Scheduler](https://neekey.net/2023/09/02/automating-startup-of-an-electron-app-on-windows-machines-using-task-scheduler/)
- [How does asaar work in Electron for Sharp? (GitHub Issue #3985)](https://github.com/lovell/sharp/issues/3985)
- [Auto Unpack Native Modules Plugin | Electron Forge](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [asarUnpack not honored with electron-builder 25.1.8 (GitHub Issue #8640)](https://github.com/electron-userland/electron-builder/issues/8640)
- [Issue packaging native dependence using asar (GitHub Issue #2679)](https://github.com/electron-userland/electron-builder/issues/2679)
