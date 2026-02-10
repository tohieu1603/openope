# Cloudflare Tunnel Integration Research: Electron Desktop Apps

**Date:** 2026-02-06 | **Target:** Windows 10/11 Desktop App | **Use Case:** Local Node.js gateway (127.0.0.1:18789) exposed to internet via Cloudflare Tunnel

---

## 1. Cloudflared Binary Management in Desktop Apps

**Bundling Strategy:**
- Bundle cloudflared.exe (~50-100MB) within app resources at build time OR download on first run.
- **Pros (bundled):** Zero-dependency startup, offline capability, version lock with app release.
- **Pros (download):** Smaller initial install, independent cloudflare updates without app rebuild.
- **Versioning:** Pin specific cloudflared version in build config; fetch from [GitHub releases](https://github.com/cloudflare/cloudflared/releases).

**Auto-Update:**
- Cloudflared has built-in `--update` flag downloads latest binary; can replace in-use binary with restart.
- Use [electron-builder](https://www.electron.build/auto-update.html) + [Cloudflare R2 storage](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) for app-level auto-updates.
- Recommend: Download on first run + periodic check-for-updates, fallback to bundled version if download fails.

---

## 2. Cloudflared Tunnel Run --Token

**Named Tunnels & Token Auth:**
- Remotely-managed tunnels run with `cloudflared tunnel run --token <TOKEN>` (no local config file needed).
- Token is the sole credential; anyone with token can run tunnel. Rotate regularly.
- Named tunnels persist in Cloudflare dashboard; route traffic via CNAME records pointing to `<UUID>.cfargotunnel.com`.
- Multiple cloudflared connectors (processes) can run same tunnel simultaneously for load balancing.

**Fixed Domain Support:**
- Tunnels are persistent DNS objects; DNS CNAME records point to Cloudflare's anycast network.
- When tunnel starts, it registers with edge; traffic routes automatically. Disconnection = automatic failover to healthy connectors.

**Process Spawning:**
- Use Node.js `child_process.spawn()` to run `cloudflared tunnel run --token <TOKEN>`.
- Monitor stdout/stderr for "Connected to Cloudflare" / error messages.
- Exit code 0 = success, code 1 = failure; graceful shutdown on SIGTERM.

---

## 3. Exposing Local Node.js Gateway to Internet

**Architecture:**
- Local Node.js gateway listens on 127.0.0.1:18789.
- Cloudflared ingress config routes incoming tunnel traffic to localhost:18789.
- Using `--token` mode, no ingress config file needed; configure via Cloudflare dashboard instead.

**Setup Modes:**
- **Dashboard-managed (recommended for Electron):** Create tunnel via Cloudflare dashboard, assign domain/subdomain, add ingress rule pointing to `http://localhost:18789`. Launch cloudflared with token only.
- **File-based config:** Alternative using `~/.cloudflared/config.yml`; requires file management in Electron app data folder.

**Result:** Remote server calls tunnel's public domain → routes to cloudflared → proxies to 127.0.0.1:18789 → Node.js gateway responds.

---

## 4. Security Considerations

**Token Storage & Encryption:**
- Token = root credential. Store in Electron's [safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) (platform-native encryption).
  - **Windows:** DPAPI encryption; decryptable only by user with same logon credentials.
  - **macOS:** Keychain; protected from other apps/users.
  - **Linux:** kwallet/gnome-libsecret fallback.
- Never store tokens in plain text, localStorage, or config files in user home directory.

**At-Rest Encryption:**
- Cloudflare encrypts tunnel traffic in transit (TLS 1.3); local gateway communication assumed on localhost (unencrypted but isolated).
- Token leakage risk: Implement access controls at tunnel ingress; only allow specific remote IPs/origins if possible.

**Best Practices:**
1. Use separate tunnel token per environment (dev/prod).
2. Rotate token quarterly; invalidate old tokens immediately.
3. Never log or expose token in error messages/logs.
4. Validate token format before spawning cloudflared (prevent injection attacks).

---

## 5. Process Lifecycle & Health Management

**Health Signals:**
- cloudflared logs "Connected to Cloudflare" on successful registration.
- Control plane RPC handles connection lifecycle; graceful shutdown unregisters tunnel immediately.
- Exit code 0 = clean shutdown; code 1 = error; code 4 (ILL) = illegal instruction (platform mismatch).

**Reconnection Behavior:**
- Automatic reconnect on network loss; exponential backoff (30s max).
- Multiple connectors enable failover; Cloudflare edge drops stale sessions.
- Grace period: respects TunnelConfig timeouts (varies by protocol; typically 15-30s for TCP/UDP).

**Graceful Shutdown:**
- Send SIGTERM to cloudflared process; waits for grace period before force-kill.
- Control plane immediately unregisters tunnel; existing connections drain gracefully.
- Implement timeout (15-30s) in Electron app; force kill if cloudflared doesn't exit cleanly.

**Monitoring:**
- Parse stdout for "error" / "disconnected" patterns.
- Implement health check: periodically call local gateway (http://localhost:18789/health) or tunnel's public URL.
- If unhealthy for >60s, restart cloudflared process.

---

## Recommendations Summary

1. **Bundling:** Download cloudflared on first run; fallback to bundled version for offline resilience.
2. **Token Management:** Use Electron safeStorage; rotate quarterly.
3. **Ingress:** Configure via Cloudflare dashboard (simpler than file management in Electron).
4. **Process Control:** Spawn via child_process; monitor health via stdout + periodic health checks.
5. **Graceful Shutdown:** SIGTERM + 30s timeout before force-kill.

---

## Sources

- [Cloudflare Tunnel Downloads & Updates](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
- [cloudflared GitHub Releases](https://github.com/cloudflare/cloudflared)
- [Electron Auto-Update](https://www.electron.build/auto-update.html)
- [Cloudflare Tunnel Run Parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/run-parameters/)
- [Cloudflare Tunnel Setup Guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Exposing Local Services with Cloudflare Tunnel](https://medium.com/design-bootcamp/how-to-setup-a-cloudflare-tunnel-and-expose-your-local-service-or-application-497f9cead2d3)
- [Cloudflare Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)
- [cloudflared-tunnel-gui (Electron example)](https://github.com/hidumou/cloudflared-tunnel-gui)
- [Graceful Shutdown in cloudflared](https://github.com/cloudflare/cloudflared/issues/198)
