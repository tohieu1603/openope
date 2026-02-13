# Research: Tự động tạo Cloudflare Tunnel qua API

**Ngày:** 2026-02-11
**Chủ đề:** Tự động hóa tạo Cloudflare Tunnel cho Electron app mà không cần user thao tác thủ công

---

## Tóm tắt Executive

Có **3 phương án** khả thi cho tự động tạo Cloudflare Tunnel:

1. **Quick Tunnels** - Tạm thời, không auth, hạn chế (khuyến nghị cho dev/test)
2. **Backend-managed API** - Backend tạo tunnel cho từng user qua API (khuyến nghị cho production)
3. **Client-side API** - App tự tạo tunnel bằng admin token (rủi ro bảo mật cao)

**Khuyến nghị:** Dùng Backend-managed approach (phương án 2).

---

## 1. Cloudflare API tạo Tunnel

### Endpoint
```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel
```

### Yêu cầu
- **API Token** với permissions:
  - Account
  - Cloudflare Tunnel
  - Edit
- **Account ID** (lấy từ Cloudflare Dashboard)
- **Tunnel secret** (random string dài)

### Headers
```
Authorization: Bearer {API_TOKEN}
Content-Type: application/json
```

### Request Body
```json
{
  "name": "user-{userId}-{timestamp}",
  "tunnel_secret": "<base64-encoded-32-byte-secret>",
  "config_src": "cloudflare"
}
```

### Response
```json
{
  "result": {
    "id": "<tunnel-uuid>",
    "name": "user-123-1234567890",
    "created_at": "2026-02-11T...",
    "conns_active_at": null,
    "conns_inactive_at": null,
    "tun_type": "cfd_tunnel",
    "token": "<tunnel-token>"  // CHỈ HIỂN THỊ 1 LẦN
  }
}
```

**LƯU Ý QUAN TRỌNG:**
- `token` chỉ trả về 1 lần duy nhất khi tạo
- Phải lưu token ngay lập tức
- Token này dùng để chạy `cloudflared tunnel run`

### Tạo credentials.json
Sau khi tạo tunnel qua API, tạo file credentials:
```json
{
  "AccountTag": "{account_id}",
  "TunnelSecret": "{tunnel_secret}",
  "TunnelID": "{tunnel_uuid}"
}
```

---

## 2. Cấu hình DNS/Routes qua API

### Tạo DNS record
```
POST https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records
```

```json
{
  "type": "CNAME",
  "name": "user123",
  "content": "{tunnel-uuid}.cfargotunnel.com",
  "proxied": true
}
```

### Cấu hình tunnel config
```
PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations
```

```json
{
  "config": {
    "ingress": [
      {
        "hostname": "user123.yourdomain.com",
        "service": "http://localhost:8080"
      },
      {
        "service": "http_status:404"
      }
    ]
  }
}
```

---

## 3. Single Admin Token cho Multiple Users

### Khả thi: CÓ
- 1 admin API token có thể tạo nhiều tunnels
- Mỗi tunnel có UUID và token riêng
- Tunnels chỉ proxy traffic cho DNS records trong cùng account

### Permissions cần thiết
API token cần:
- `Account:Cloudflare Tunnel:Edit`
- `Zone:DNS:Edit` (nếu muốn tự động tạo DNS)
- Scope: Specific account

### Bảo mật
- Admin token **KHÔNG** được embed vào client app
- Admin token phải được bảo vệ ở backend
- Rotation token định kỳ (recommended)
- Rate limit: 1200 requests/5 minutes (global API limit)

---

## 4. Giới hạn (Limits)

### Free Plan
- **1000 tunnels** per account
- **200 concurrent requests** per quick tunnel
- No bandwidth limits cho tunnels thường

### API Rate Limits
- Global: **1200 requests / 5 phút** per user
- Không có rate limit riêng cho tunnel creation

### Tunnel Naming
- Có thể đặt tên unique per user: `user-{userId}` hoặc `user-{email}-{timestamp}`
- Cloudflare tự gen UUID cho mỗi tunnel
- UUID không phải secret, nhưng chỉ proxy traffic trong cùng account

---

## 5. CLI Automation với cloudflared

### cloudflared tunnel login
**Vấn đề:** Yêu cầu interactive browser login
- Mở browser để auth với Cloudflare
- Tạo file `cert.pem` trong `~/.cloudflared/`

**Giải pháp automation:**
1. Script tạo `cert.pem` qua API (sử dụng API key)
2. Set env var: `TUNNEL_ORIGIN_CERT=/path/to/cert.pem`
3. Hoặc dùng `--origincert` flag

### cloudflared tunnel create
```bash
cloudflared tunnel create user-123
```
- Yêu cầu cert.pem đã tồn tại
- Tạo credentials file: `~/.cloudflared/{uuid}.json`
- Không thể fully automated nếu không có cert.pem sẵn

**Kết luận:** CLI không phù hợp cho automation trong Electron app vì:
- Yêu cầu cert.pem (cần browser login)
- Không thể non-interactive hoàn toàn
- API approach tốt hơn

---

## 6. Quick Tunnels - Alternative đơn giản nhất

### Đặc điểm
```bash
cloudflared tunnel --url http://localhost:8080
```

- **Không cần auth** (không cần account, API token, cert.pem)
- **Tạo ngay** subdomain random: `https://random.trycloudflare.com`
- **Tạm thời:** Tunnel die khi process die
- **Giới hạn:** 200 concurrent requests
- **Không SLA:** Không đảm bảo uptime
- **Chỉ phù hợp:** Dev/testing, không phải production

### Use case
- Demo tạm thời
- Development testing
- Proof of concept

**KHÔNG KHUYẾN NGHỊ** cho production app với nhiều users.

---

## 7. Backend-managed Approach (KHUYẾN NGHỊ)

### Kiến trúc
```
User Desktop App → admin.operis.vn API → Cloudflare API
                                     ↓
                              Trả về tunnel token
```

### Flow
1. User mở desktop app
2. App gọi `POST /api/tunnels/create` tới admin.operis.vn
3. Backend (admin.operis.vn):
   - Dùng admin API token (được bảo mật ở backend)
   - Gọi Cloudflare API tạo tunnel
   - Lưu tunnel metadata vào database
   - Trả tunnel token về cho app
4. App nhận token, lưu vào config local
5. App chạy `cloudflared tunnel run --token {token}`

### Ưu điểm
- ✅ Admin token được bảo mật ở backend
- ✅ Kiểm soát centralized (rate limit, quota, revoke)
- ✅ Audit trail (log tất cả tunnel creation)
- ✅ Có thể implement usage tracking
- ✅ Dễ rotate admin token mà không ảnh hưởng users

### Nhược điểm
- ❌ Cần backend API endpoint mới
- ❌ Dependency vào backend availability
- ❌ Cần database để track tunnels

### API Endpoint cần implement
```
POST /api/v1/tunnels/create
Authorization: Bearer {user-jwt-token}

Request:
{
  "userId": "user123",
  "purpose": "desktop-app"
}

Response:
{
  "tunnelId": "uuid",
  "tunnelToken": "eyJh...",
  "tunnelName": "user-user123-1707654321",
  "expiresAt": null
}
```

---

## 8. Client-side API Approach (KHÔNG KHUYẾN NGHỊ)

### Mô tả
- Embed admin API token trực tiếp vào Electron app
- App tự gọi Cloudflare API tạo tunnel

### Rủi ro BẢO MẬT CAO
- ❌ Admin token có thể bị extract từ app bundle
- ❌ User có thể abuse token để spam tunnels
- ❌ Không kiểm soát được usage
- ❌ Token compromise = toàn bộ account bị ảnh hưởng

**TUYỆT ĐỐI KHÔNG NÊN DÙNG** cho production.

---

## 9. Khuyến nghị Implementation

### Phase 1: Development/Testing
Dùng **Quick Tunnels**:
```javascript
// gateway-manager.ts
const { spawn } = require('child_process');

const proc = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8080']);

proc.stdout.on('data', (data) => {
  const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    console.log('Tunnel URL:', match[0]);
    // Lưu URL và hiển thị cho user
  }
});
```

### Phase 2: Production
Dùng **Backend-managed API**:

#### Backend (admin.operis.vn)
```javascript
// POST /api/v1/tunnels/create
const axios = require('axios');

async function createTunnel(userId) {
  const tunnelName = `user-${userId}-${Date.now()}`;
  const tunnelSecret = crypto.randomBytes(32).toString('base64');

  const response = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/cfd_tunnel`,
    {
      name: tunnelName,
      tunnel_secret: tunnelSecret,
      config_src: 'cloudflare'
    },
    {
      headers: {
        'Authorization': `Bearer ${CF_ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const { id, token } = response.data.result;

  // Lưu vào database
  await db.tunnels.create({
    userId,
    tunnelId: id,
    tunnelName,
    createdAt: new Date()
  });

  return { tunnelId: id, tunnelToken: token, tunnelName };
}
```

#### Client (Electron app)
```javascript
// onboard-manager.ts
async function setupTunnel() {
  const response = await fetch('https://admin.operis.vn/api/v1/tunnels/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: currentUserId })
  });

  const { tunnelToken } = await response.json();

  // Lưu vào config
  saveConfig({ tunnelToken });

  // Chạy tunnel
  spawnCloudflared(['tunnel', 'run', '--token', tunnelToken]);
}
```

---

## 10. Alternatives ngoài Cloudflare

### Ngrok
- Tương tự quick tunnels
- Free tier: 1 tunnel, random URL
- Paid: custom domain, reserved tunnels
- API có sẵn cho automation

### LocalTunnel
- Open source, self-hostable
- Không stable như Cloudflare
- Không phù hợp production

### Tailscale Funnel
- Dựa trên WireGuard
- Yêu cầu Tailscale account
- Phức tạp hơn cho end users

**Kết luận:** Cloudflare Tunnel vẫn là lựa chọn tốt nhất (free, stable, good DX).

---

## Câu hỏi chưa giải quyết

1. **Tunnel lifecycle management:**
   - Khi nào delete tunnel? (user uninstall app?)
   - Có nên reuse tunnel hay tạo mới mỗi lần?

2. **DNS management:**
   - Subdomain structure: `user123.operis.vn` hay `random-id.operis.vn`?
   - Tự động tạo DNS record qua API hay manual?

3. **Error handling:**
   - Xử lý khi backend down, không tạo được tunnel?
   - Fallback mechanism?

4. **Usage tracking:**
   - Monitor bandwidth per tunnel?
   - Alert khi reach limits?

5. **Cost:**
   - Free tier có đủ cho 1000+ users?
   - Khi nào cần upgrade Cloudflare plan?

---

## Sources

- [Create a tunnel (API) - Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)
- [Tunnel permissions - Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/)
- [Quick Tunnels - Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Rate limits - Cloudflare API](https://developers.cloudflare.com/fundamentals/api/reference/limits/)
- [Account limits - Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/account-limits/)
- [Tunnel useful terms - Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/tunnel-useful-terms/)
- [Create API token - Cloudflare docs](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare Tunnel GitHub](https://github.com/cloudflare/cloudflared)
