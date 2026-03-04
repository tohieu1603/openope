# Gateway Token Mismatch After Reinstall

## Problem Statement

Sau khi xóa `~/.operis` + uninstall + cài lại app mới, gateway token bị mismatch → chat không hoạt động. App tự bỏ qua login (session cookies persist qua reinstall).

**Reproduce:**
1. Install app lần 1 → token A generated → gateway chạy với A → device paired
2. Xóa folder `~/.operis` + Uninstall app
3. Install app lần 2 → token B generated → gateway chạy với B
4. App load → `?token=B` trong URL → session restore (cookies cũ vẫn còn)
5. WS connect → nhưng gateway log: **"token_mismatch"**

## Nguyên nhân có thể (3 khả năng)

### Khả năng 1: Gateway process cũ (zombie) vẫn chạy trên port 18789 ⭐ LIKELY
- Uninstaller kill Electron app nhưng child process gateway **CÓ THỂ sống sót**
- Gateway cũ: token A, vẫn listen port 18789
- App mới spawn gateway mới (token B) nhưng **port bị chiếm** → silent fail hoặc crash
- Client connect tới gateway CŨ (token A) với token B → mismatch

### Khả năng 2: `syncGatewayTokenToConfig` ghi đè token trong will-navigate
- `main.ts:96-114`: Khi client redirect `/?token=X`, will-navigate handler gọi `syncGatewayTokenToConfig(X)` ghi vào operis.json
- Nếu trong 1 session trước đó backend token A đã ghi vào operis.json, rồi user xóa `.operis` reinstall, token mới B tạo ra
- Nhưng khi `tryRestoreSession` thành công → `provisionAndStartTunnel()` fire-and-forget → PATCH backend với B
- **Không có redirect** trong session restore → will-navigate KHÔNG trigger → token B giữ nguyên → **KHÔNG phải root cause**

### Khả năng 3: Device auth token cũ trong localStorage
- `AppData/Roaming/Agent Operis/` KHÔNG bị xóa khi uninstall
- `localStorage["operis.device.auth.v1"]` vẫn còn device token từ lần install cũ (paired với gateway token A)
- Khi WS connect: `authToken = this.opts.token ?? storedToken = B` (URL token có priority, ĐÚNG)
- Nhưng device token gửi kèm (`connectParams.auth.token = B`) được verify đúng → **KHÔNG phải root cause trực tiếp**
- Tuy nhiên device cũ có thể gây auth conflict ở bước device pairing

## Kết luận: Khả năng 1 là likely nhất

Cần verify bằng cách kiểm tra: sau uninstall + reinstall, có process gateway cũ (node.exe) nào vẫn chiếm port 18789 không.

## Tất cả nơi lưu trữ Gateway Token

| # | Vị trí | Loại | Khi nào set | Khi nào xóa |
|---|--------|------|-------------|-------------|
| 1 | `~/.operis/operis.json` → `gateway.auth.token` | Disk file | First run (`createMinimalConfig`) | User xóa folder |
| 2 | `GatewayManager.gatewayToken` (Electron main) | RAM | App startup + login | App close |
| 3 | Env `OPENCLAW_GATEWAY_TOKEN` (child process) | Process env | Gateway spawn | Process exit |
| 4 | **operismb backend DB** (`user.gateway_token`) | Remote DB | `PATCH /auth/gateway` | Never auto-cleared |
| 5 | **Login response** (`result.user.gateway_token`) | HTTP response | Each login | N/A |
| 6 | **URL param** `?token=xxx` | Browser URL | Login redirect | Page reload |
| 7 | `localStorage` `operis.device.auth.v1` | Browser storage | WS connect ok | Manual clear |

## Root Cause Analysis

### Race Condition trong handleLogin

```
handleLogin()
  ├─ authLogin(email, password) → result.user.gateway_token = A (CŨ từ DB)
  ├─ provisionAndStartTunnel()
  │   └─ getGatewayConfig() IPC → reads LOCAL token B from operis.json
  │   └─ apiClient.patch("/auth/gateway", { gateway_token: B }) → UPDATE backend
  └─ window.location.href = /?token=A  ← VẪN DÙNG TOKEN CŨ TỪ LOGIN RESPONSE!
```

**Vấn đề cốt lõi:** `result.user.gateway_token` là snapshot từ thời điểm login. Dù `provisionAndStartTunnel` đã update backend với token B mới, nhưng **redirect vẫn dùng token A cũ từ login response**.

### Vấn đề phụ: Device Auth Token cũ trong localStorage

- `localStorage["operis.device.auth.v1"]` lưu device token từ lần connect trước
- Electron dùng `file://` protocol → localStorage persist qua reinstall (cùng origin)
- Token device cũ có thể cũng gây conflict

### Vấn đề phụ 2: `syncGatewayTokenToConfig` ghi đè token local

```typescript
// main.ts:96-114 — will-navigate handler
const token = parsed.searchParams.get("token"); // token A (cũ)
if (token) {
  syncGatewayTokenToConfig(token); // GHI ĐÈ operis.json token B → A (CŨ!)
  gateway.gatewayToken = token;     // GHI ĐÈ RAM token B → A (CŨ!)
  loadClientWeb(win, token);
}
```

Sau redirect, `syncGatewayTokenToConfig(A)` **ghi đè token B mới trong operis.json bằng token A cũ!** Nhưng gateway process vẫn chạy với env token B → mismatch vĩnh viễn cho đến khi restart gateway.

## Đề xuất giải pháp

### Approach 1: Dùng local token thay vì backend token (Recommended)

Thay đổi `handleLogin()` — sau `provisionAndStartTunnel`, đọc token từ local config (IPC) thay vì dùng `result.user.gateway_token`:

```typescript
// Sau provisionAndStartTunnel đã sync token mới lên backend
// Đọc token local (source of truth) thay vì dùng response cũ
const localConfig = await window.electronAPI?.getGatewayConfig?.();
const localToken = localConfig?.gatewayToken || result.user.gateway_token;
if (localToken) {
  window.location.href = `/?token=${encodeURIComponent(localToken)}`;
  return;
}
```

**Pros:** Luôn dùng token đúng, simple fix, 1 file change
**Cons:** Thêm 1 IPC call

### Approach 2: Bỏ redirect, pass token qua IPC

Không redirect `window.location.href`. Thay vào đó, pass token trực tiếp cho gateway-client qua IPC:

```typescript
// Không redirect, thay vào đó inject token vào gateway client
const localConfig = await window.electronAPI?.getGatewayConfig?.();
if (localConfig?.gatewayToken) {
  setGatewayToken(localConfig.gatewayToken); // New function in gateway-client.ts
}
this.setTab("chat");
```

**Pros:** Không cần page reload, smoother UX
**Cons:** Cần refactor gateway-client singleton, phức tạp hơn

### Approach 3: Backend luôn trả token mới nhất sau PATCH

Thay đổi flow: `PATCH /auth/gateway` trả về token đã update → dùng token từ PATCH response:

**Pros:** Backend luôn đồng bộ
**Cons:** Cần sửa backend API, vẫn có race condition nếu PATCH fail

## Recommendation

**Approach 1** — đơn giản nhất, KISS, fix đúng root cause. Source of truth cho gateway token luôn là **local config file** (`operis.json`), không phải backend DB.

Ngoài ra cần **clear stale device auth** khi token thay đổi:
- Trong `will-navigate` handler, nếu `syncGatewayTokenToConfig` return true (token changed) → không ghi đè, hoặc restart gateway
- Hoặc đơn giản: bỏ `syncGatewayTokenToConfig` trong will-navigate — chỉ dùng local token

## Unresolved Questions

1. Có cần clear `localStorage["operis.device.auth.v1"]` khi phát hiện token change?
2. `syncGatewayTokenToConfig` trong will-navigate nên giữ hay bỏ? (hiện tại nó ghi đè token local bằng token backend cũ)
3. Khi nào backend gateway_token nên được update? Chỉ khi provision tunnel hay mỗi lần login?
