# Phase 1: Chrome Extension Branding

**Priority:** LOW
**Risk:** NONE — isolated component, no gateway dependency
**Status:** pending

---

## Changes

### File 1: `assets/chrome-extension/manifest.json`
| Line | Old | New |
|------|-----|-----|
| 3 | `"name": "OpenClaw Browser Relay"` | `"name": "Operis Browser Relay"` |
| 5 | `"description": "Attach OpenClaw to your existing Chrome tab..."` | `"description": "Attach Operis Agent to your existing Chrome tab..."` |
| 16 | `"default_title": "OpenClaw Browser Relay (click to attach/detach)"` | `"default_title": "Operis Browser Relay (click to attach/detach)"` |

### File 2: `assets/chrome-extension/options.html`
| Line | Old | New |
|------|-----|-----|
| 6 | `<title>OpenClaw Browser Relay</title>` | `<title>Operis Browser Relay</title>` |
| 161 | `<h1>OpenClaw Browser Relay</h1>` | `<h1>Operis Browser Relay</h1>` |
| 171 | `"Start OpenClaw's browser relay on this machine..."` | `"Start Operis browser relay on this machine..."` |
| 187 | `"...if your OpenClaw profile uses a different..."` | `"...if your Operis profile uses a different..."` |

### File 3: `assets/chrome-extension/background.js`
| Line | Old | New |
|------|-----|-----|
| 117 | `'OpenClaw Browser Relay: disconnected...'` | `'Operis Browser Relay: disconnected...'` |
| 228 | `'OpenClaw Browser Relay: attached...'` | `'Operis Browser Relay: attached...'` |
| 281 | `'OpenClaw Browser Relay (click to attach/detach)'` | `'Operis Browser Relay (click to attach/detach)'` |
| 300 | `'OpenClaw Browser Relay: connecting...'` | `'Operis Browser Relay: connecting...'` |
| 311 | `'OpenClaw Browser Relay: relay not running...'` | `'Operis Browser Relay: relay not running...'` |

### File 4: `assets/chrome-extension/options.js`
| Line | Old | New |
|------|-----|-----|
| 34 | `"...Start OpenClaw's browser relay on this machine..."` | `"...Start Operis browser relay on this machine..."` |

---

## Total: 12 string replacements across 4 files
