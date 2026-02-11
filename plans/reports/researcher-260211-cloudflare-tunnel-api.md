# Cloudflare Tunnel API - Nghiên Cứu Chi Tiết

**Ngày báo cáo:** 2026-02-11
**Mục đích:** Cung cấp thông tin kỹ thuật cụ thể về API Cloudflare Tunnel cho việc tạo tunnel, cấu hình route, quản lý DNS, định giá và vòng đời tunnel.

---

## 1. CREATE TUNNEL API

### Endpoint
```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel
```

### Request Body Format

**Tối thiểu (config_src = cloudflare):**
```json
{
  "name": "my-tunnel",
  "config_src": "cloudflare"
}
```

**Hoặc với tunnel_secret:**
```json
{
  "name": "my-tunnel",
  "tunnel_secret": "base64-encoded-32-bytes-minimum"
}
```

**Ghi chú:**
- `name`: Tên tunnel (bắt buộc), string
- `tunnel_secret`: Base64-encoded random string, tối thiểu 32 bytes
- `config_src`: Nếu dùng "cloudflare" = tunnel sẽ được cấu hình qua API/Dashboard (lựa chọn khuyên dùng)

### Response Format

**HTTP 201 - Success:**
```json
{
  "success": true,
  "errors": [],
  "messages": [],
  "result": {
    "id": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c",
    "name": "my-tunnel",
    "account_tag": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4",
    "status": "inactive",
    "created_at": "2026-02-11T10:30:00Z",
    "deleted_at": null,
    "remote_config": true,
    "credentials_file": {
      "AccountTag": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4",
      "TunnelID": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c",
      "TunnelName": "my-tunnel",
      "TunnelSecret": "base64-encoded-secret-string"
    },
    "token": "eyJhIjoiYTFiMmMzZDRlNWY2ZzdoOGk5ajBrMWwybTNuNCIsInQiOiI2ZmY3ZTUwZC1hMGY0LTRjMmUtOWI4ZS0zYzVkOGYxYTJiOWMiLCJzIjoiYmFzZTY0LWVuY29kZWQtc2VjcmV0LXN0cmluZyJ9"
  }
}
```

### Tunnel Token Structure

Token là **JWT-like base64-encoded JSON** chứa:
```json
{
  "a": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4",  // Account ID
  "t": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c",  // Tunnel ID
  "s": "base64-encoded-secret-string"  // Tunnel Secret
}
```

Base64 decode token để lấy tunnel_id:
```javascript
const token = "eyJhIjoiYTFiMmMzZDRlNWY2ZzdoOGk5ajBrMWwybTNuNCIsInQiOiI2ZmY3ZTUwZC1hMGY0LTRjMmUtOWI4ZS0zYzVkOGYxYTJiOWMiLCJzIjoiYmFzZTY0LWVuY29kZWQtc2VjcmV0LXN0cmluZyJ9";
const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
console.log(decoded.t); // tunnel_id
```

### Curl Example
```bash
ACCOUNT_ID="a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
API_TOKEN="your-api-token-here"
TUNNEL_SECRET=$(echo -n "$(openssl rand -hex 32)" | base64)

curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"my-tunnel\",\"tunnel_secret\":\"$TUNNEL_SECRET\"}" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel"
```

---

## 2. CONFIGURE TUNNEL INGRESS / ROUTES

### Endpoint
```
PUT https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel/{TUNNEL_ID}/configurations
```

### Request Body Format

```json
{
  "config": {
    "ingress": [
      {
        "hostname": "api.example.com",
        "service": "http://localhost:3000",
        "originRequest": {
          "http2Origin": true,
          "noTLSVerify": false,
          "connectTimeout": 30,
          "tlsTimeout": 10
        }
      },
      {
        "hostname": "web.example.com",
        "service": "http://localhost:5000"
      },
      {
        "hostname": "*.example.com",
        "service": "http://localhost:8080"
      },
      {
        "service": "http_status:404"
      }
    ]
  }
}
```

### Ingress Rules Chi Tiết

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `hostname` | string | Không | Hostname pattern (CNAME sẽ trỏ đến đây). Hỗ trợ wildcard: `*.example.com` |
| `path` | string | Không | Regex pattern để match path: `^/api/.*` |
| `service` | string | Có | URL backend hoặc special service: `http://localhost:8080`, `http_status:404`, `http_status:401` |
| `originRequest` | object | Không | Cấu hình kết nối đến origin |
| `originRequest.http2Origin` | bool | Không | Sử dụng HTTP/2 tới origin (default: false) |
| `originRequest.noTLSVerify` | bool | Không | Bỏ qua SSL verification (default: false) - chỉ dùng cho test/self-signed |
| `originRequest.connectTimeout` | number | Không | Timeout kết nối (giây, default: 30) |
| `originRequest.tlsTimeout` | number | Không | Timeout TLS (giây, default: 10) |
| `originRequest.keepAliveTimeout` | number | Không | Keep-alive timeout (default: 90) |
| `originRequest.headers` | object | Không | Custom headers thêm vào request |

### Quy Tắc Catch-All

**BẮTBUỘC:** Phải có 1 ingress rule cuối cùng không có `hostname` (catch-all):
```json
{
  "service": "http_status:404"
}
```

Nếu không, cloudflared sẽ reject requests không match.

### Curl Example
```bash
ACCOUNT_ID="a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
TUNNEL_ID="6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c"
API_TOKEN="your-api-token-here"

curl -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {
          "hostname": "api.operis.vn",
          "service": "http://localhost:3000"
        },
        {
          "hostname": "web.operis.vn",
          "service": "http://localhost:5000"
        },
        {
          "service": "http_status:404"
        }
      ]
    }
  }' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations"
```

---

## 3. DNS ROUTE / CNAME CREATION

### Endpoint
```
POST https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records
```

### Request Body Format

```json
{
  "type": "CNAME",
  "name": "api",
  "content": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c.cfargotunnel.com",
  "ttl": 3600,
  "proxied": true
}
```

### Response Format

**HTTP 201 - Success:**
```json
{
  "success": true,
  "errors": [],
  "messages": [],
  "result": {
    "id": "372e67954025e0ba6aaa6d586b9e0b59",
    "type": "CNAME",
    "name": "api.operis.vn",
    "content": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c.cfargotunnel.com",
    "ttl": 3600,
    "proxied": true,
    "created_on": "2026-02-11T10:30:00Z",
    "modified_on": "2026-02-11T10:30:00Z"
  }
}
```

### Chi Tiết

| Field | Giá trị | Mô tả |
|-------|--------|-------|
| `type` | CNAME | Luôn là CNAME cho tunnel |
| `name` | string | Subdomain (ví dụ: "api", "web", "admin"). Sẽ trở thành "api.operis.vn" |
| `content` | string | **`{TUNNEL_ID}.cfargotunnel.com`** - UUID tunnel + ".cfargotunnel.com" |
| `ttl` | number | Time-to-live (1 = auto, hoặc 120-86400) |
| `proxied` | bool | **true** = traffic qua Cloudflare (bắt buộc cho tunnel) |

### Cách Lấy Zone ID

```bash
curl -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=operis.vn" \
  | jq '.result[0].id'
```

### Curl Example
```bash
ZONE_ID="e9a64d61d38d7b006554b4b04e340ca6"
TUNNEL_ID="6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c"
API_TOKEN="your-api-token-here"

curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"api\",
    \"content\": \"$TUNNEL_ID.cfargotunnel.com\",
    \"ttl\": 3600,
    \"proxied\": true
  }" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records"
```

---

## 4. API TOKEN PERMISSIONS

### Scopes Cần Thiết

**Tối thiểu để quản lý tunnel:**
- **Account** > **Cloudflare Tunnel** > **Edit** (Write permission)

**Để quản lý DNS:**
- **Zone** > **DNS** > **Edit**

**Full flow:**
- **Account** scope: `com.cloudflare.api.account`
  - Cloudflare Tunnel: Edit (create, read, update, delete, list)
- **Zone** scope: Specific zone hoặc All zones
  - DNS: Edit (create, read, update, delete records)

### Tạo Custom API Token

```bash
curl -X POST \
  -H "Authorization: Bearer $GLOBAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tunnel API Token",
    "description": "For Cloudflare Tunnel management",
    "ttl": 31536000,
    "policies": [
      {
        "effect": "allow",
        "resources": {
          "com.cloudflare.api.account.*": "*"
        },
        "permission_groups": [
          {
            "id": "b1530994-1c6e-4654-a3a6-da3c91447e59"  // Cloudflare Tunnel Edit
          },
          {
            "id": "82bc689a-37b9-47d3-8541-nc2e3f3c3a59"  // DNS Edit
          }
        ]
      }
    ]
  }' \
  "https://api.cloudflare.com/client/v4/user/tokens"
```

---

## 5. PRICING & LIMITS

### Cloudflare Tunnel Pricing

| Aspect | Chi Tiết |
|--------|----------|
| **Tunnel Cost** | **HOÀN TOÀN MIỄN PHÍ** - không chi phí per tunnel |
| **Free Plan** | Unlimited tunnels, cấu hình via API/Dashboard |
| **Zero Trust Free** | 50 users, 1000 tunnels, 500 access apps |
| **Zero Trust Paid** | $7/user/month (billed annually) |
| **Enterprise** | Custom pricing, extended log retention (6 months) |

### Account Limits (Free Plan)

| Giới hạn | Giá trị |
|---------|--------|
| Tunnels per account | 1,000 |
| Access applications | 500 |
| Zero Trust users (free) | 50 |
| Tunnel connections | 4 per tunnel (to different Cloudflare colos) |

### DNS Limits

| Giới hạn | Giá trị |
|---------|--------|
| DNS records per zone | Unlimited (with Cloudflare) |
| API requests per second | Rate-limited (varies by plan) |

### Không Có Chi Phí Cho

- Tunnel creation/deletion
- Ingress rule updates
- DNS CNAME creation
- Tunnel status checks
- Tất cả features cho free plan

---

## 6. TUNNEL LIFECYCLE API

### Get Tunnel Token

```
GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel/{TUNNEL_ID}/token
```

**Response:**
```json
{
  "success": true,
  "result": {
    "token": "eyJhIjoiYTFiMmMzZDRlNWY2ZzdoOGk5ajBrMWwybTNuNCIsInQiOiI2ZmY3ZTUwZC1hMGY0LTRjMmUtOWI4ZS0zYzVkOGYxYTJiOWMiLCJzIjoiYmFzZTY0LWVuY29kZWQtc2VjcmV0LXN0cmluZyJ9"
  }
}
```

### List Tunnels

```
GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel?per_page=100
```

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c",
      "name": "my-tunnel",
      "status": "healthy",
      "created_at": "2026-02-11T10:30:00Z"
    }
  ],
  "result_info": {
    "page": 1,
    "per_page": 100,
    "count": 1,
    "total_count": 1
  }
}
```

### Get Tunnel Details

```
GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel/{TUNNEL_ID}
```

### Delete Tunnel

```
DELETE https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel/{TUNNEL_ID}?cascade=true
```

**Query Parameters:**
- `cascade=true`: Xóa tunnel + tất cả cấu hình (DNS records vẫn cần xóa riêng)

### Tunnel Health / Connections

```
GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/cfd_tunnel/{TUNNEL_ID}/connections
```

**Response (Healthy Tunnel):**
```json
{
  "success": true,
  "result": [
    {
      "id": "UUID-1",
      "is_pending_refresh": false,
      "origin_ip": "192.168.1.100",
      "colo_name": "bos01",
      "opened_at": "2026-02-11T10:00:00Z"
    },
    {
      "id": "UUID-2",
      "is_pending_refresh": false,
      "origin_ip": "192.168.1.100",
      "colo_name": "phl01",
      "opened_at": "2026-02-11T10:00:00Z"
    }
  ]
}
```

**Status Indicator:**
- Healthy tunnel = 4 connections to different Cloudflare colos (bos01, phl01, etc.)
- Inactive tunnel = no connections
- Unhealthy = < 2 connections

---

## 7. COMPLETE FLOW EXAMPLE (Step-by-Step)

### Step 1: Tạo Tunnel

```bash
#!/bin/bash

ACCOUNT_ID="a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
API_TOKEN="your-cloudflare-api-token"
TUNNEL_NAME="operis-tunnel"

# Tạo 32-byte random secret
TUNNEL_SECRET=$(openssl rand -hex 32 | base64)

# Create tunnel
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TUNNEL_NAME\",
    \"tunnel_secret\": \"$TUNNEL_SECRET\"
  }" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel")

# Parse response
TUNNEL_ID=$(echo $RESPONSE | jq -r '.result.id')
TOKEN=$(echo $RESPONSE | jq -r '.result.token')

echo "Tunnel ID: $TUNNEL_ID"
echo "Token: $TOKEN"
echo "Status: $(echo $RESPONSE | jq -r '.result.status')"
```

**Output:**
```
Tunnel ID: 6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c
Token: eyJhIjoiYTFiMmMzZDRlNWY2ZzdoOGk5ajBrMWwybTNuNCIsInQiOiI2ZmY3ZTUwZC1hMGY0LTRjMmUtOWI4ZS0zYzVkOGYxYTJiOWMiLCJzIjoiYmFzZTY0LWVuY29kZWQtc2VjcmV0LXN0cmluZyJ9
Status: inactive
```

### Step 2: Cấu Hình Ingress Routes

```bash
TUNNEL_ID="6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c"

curl -s -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {
          "hostname": "api.operis.vn",
          "service": "http://localhost:3000",
          "originRequest": {
            "noTLSVerify": false
          }
        },
        {
          "hostname": "web.operis.vn",
          "service": "http://localhost:5000"
        },
        {
          "hostname": "admin.operis.vn",
          "service": "http://localhost:8080"
        },
        {
          "service": "http_status:404"
        }
      ]
    }
  }' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  | jq '.'
```

### Step 3: Lấy Zone ID

```bash
DOMAIN="operis.vn"

ZONE_ID=$(curl -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
  | jq -r '.result[0].id')

echo "Zone ID: $ZONE_ID"
```

### Step 4: Tạo CNAME Records

```bash
ZONE_ID="e9a64d61d38d7b006554b4b04e340ca6"
TUNNEL_ID="6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c"

# Tạo 3 CNAME records
for SUBDOMAIN in api web admin; do
  curl -s -X POST \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"CNAME\",
      \"name\": \"$SUBDOMAIN\",
      \"content\": \"$TUNNEL_ID.cfargotunnel.com\",
      \"ttl\": 3600,
      \"proxied\": true
    }" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    | jq ".result | {id, name, content}"
done
```

**Output:**
```json
{
  "id": "372e67954025e0ba6aaa6d586b9e0b59",
  "name": "api.operis.vn",
  "content": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c.cfargotunnel.com"
}
{
  "id": "472e67954025e0ba6aaa6d586b9e0b60",
  "name": "web.operis.vn",
  "content": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c.cfargotunnel.com"
}
{
  "id": "572e67954025e0ba6aaa6d586b9e0b61",
  "name": "admin.operis.vn",
  "content": "6ff7e50d-a0f4-4c2e-9b8e-3c5d8f1a2b9c.cfargotunnel.com"
}
```

### Step 5: Lấy Tunnel Token & Chạy Cloudflared

```bash
# Lấy token (nếu cần)
TOKEN=$(curl -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" \
  | jq -r '.result.token')

# Chạy cloudflared
cloudflared tunnel run --token $TOKEN

# Hoặc với credentials file
echo "$TOKEN" > ~/.cloudflare/$TUNNEL_ID/cert.pem
cloudflared tunnel run operis-tunnel
```

### Step 6: Verify Status

```bash
# Check tunnel connections (xem tunnel có healthy không)
curl -s -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/connections" \
  | jq '.result[] | {colo_name, origin_ip, opened_at}'
```

**Healthy Output:**
```json
{
  "colo_name": "bos01",
  "origin_ip": "192.168.1.100",
  "opened_at": "2026-02-11T11:30:00Z"
}
{
  "colo_name": "phl01",
  "origin_ip": "192.168.1.100",
  "opened_at": "2026-02-11T11:30:00Z"
}
```

---

## 8. Node.js Implementation Example

```javascript
// cloudflare-tunnel-api.js
const https = require('https');

class CloudflareTunnelAPI {
  constructor(accountId, apiToken) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.cloudflare.com/client/v4';
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success) {
              resolve(json.result);
            } else {
              reject(new Error(json.errors?.[0]?.message || 'API Error'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async createTunnel(name, tunnelSecret) {
    const path = `/accounts/${this.accountId}/cfd_tunnel`;
    return this.request('POST', path, { name, tunnel_secret: tunnelSecret });
  }

  async getTunnelToken(tunnelId) {
    const path = `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/token`;
    return this.request('GET', path);
  }

  async configureTunnel(tunnelId, ingress) {
    const path = `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`;
    return this.request('PUT', path, { config: { ingress } });
  }

  async listTunnels() {
    const path = `/accounts/${this.accountId}/cfd_tunnel?per_page=100`;
    return this.request('GET', path);
  }

  async deleteTunnel(tunnelId) {
    const path = `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}?cascade=true`;
    return this.request('DELETE', path);
  }

  async checkHealth(tunnelId) {
    const path = `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/connections`;
    return this.request('GET', path);
  }
}

// Usage
(async () => {
  const api = new CloudflareTunnelAPI(
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4',
    'your-api-token'
  );

  // Create tunnel
  const tunnel = await api.createTunnel(
    'operis-tunnel',
    Buffer.from(require('crypto').randomBytes(32)).toString('base64')
  );
  console.log('Created:', tunnel.id);

  // Configure ingress
  await api.configureTunnel(tunnel.id, [
    {
      hostname: 'api.operis.vn',
      service: 'http://localhost:3000'
    },
    {
      service: 'http_status:404'
    }
  ]);

  // Get token
  const { token } = await api.getTunnelToken(tunnel.id);
  console.log('Token:', token);

  // Check health
  const health = await api.checkHealth(tunnel.id);
  console.log('Connections:', health.length);
})().catch(console.error);
```

---

## 9. Important Notes & Best Practices

### Tunnel Secret
- Phải là base64-encoded string, tối thiểu 32 bytes
- Không thể lấy lại sau tạo, chỉ lưu được trong response
- Sử dụng: `openssl rand -hex 32 | base64`

### Token Structure
- JWT-like format, chứa account_id + tunnel_id + secret
- Base64 decode để verify tunnel_id
- Lưu trữ an toàn (như API keys)

### Ingress Rules
- BẮTBUỘC phải có catch-all rule cuối cùng (`{service: "http_status:404"}`)
- Order matters - first match wins
- Hỗ trợ wildcards: `*.example.com`, `example.com`, regex paths

### DNS CNAME
- Phải trỏ đến `{tunnel_id}.cfargotunnel.com`
- Chỉ hoạt động cho cùng Cloudflare account
- `proxied: true` bắt buộc để traffic qua tunnel

### Health Check
- Healthy tunnel = 4 connections đến different colos
- Kiểm tra via `/connections` endpoint
- Nếu < 2 connections = tunnel không hoạt động đúng

### Pricing
- **Hoàn toàn miễn phí** - không chi phí per tunnel
- Không limit ingress rules hay DNS records
- Free plan: 1000 tunnels per account

### API Rate Limits
- Depends on Cloudflare plan
- Typically generous for account-level operations
- Implement retry logic với exponential backoff

---

## 10. Unresolved Questions

1. **Tunnel Failover**: Có cách nào để tự động failover nếu primary tunnel down?
2. **Load Balancing**: Có thể load balance traffic giữa multiple tunnels không?
3. **Access Logs**: Tunnel traffic logs lưu ở đâu? Lấy via API?
4. **Custom Certificates**: Có thể upload custom SSL cert cho tunnel domain?
5. **Tunnel Bandwidth Limits**: Có bandwidth limit nào không?

---

## Sources

- [Create a tunnel (API) · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)
- [Setup Cloudflare Tunnel via the Cloudflare API](https://www.mediarealm.com.au/articles/cloudflare-tunnel-setup-api/)
- [Tunnel permissions · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/)
- [Cloudflare API | Zero Trust › Tunnels](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/)
- [DNS records · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)
- [Cloudflare API | DNS › Records › Create DNS Record](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)
- [API token permissions · Cloudflare Fundamentals docs](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Our Plans | Pricing | Cloudflare](https://www.cloudflare.com/plans/)
- [Cloudflare Tunnel Pricing 2026: Plans, Cost & Free Options | Toolradar](https://toolradar.com/tools/cloudflare-tunnel/pricing)
- [Zero Trust & SASE Plans & Pricing | Cloudflare](https://www.cloudflare.com/plans/zero-trust-services/)
