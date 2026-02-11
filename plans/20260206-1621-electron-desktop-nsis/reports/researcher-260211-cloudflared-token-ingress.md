# Báo Cáo: Cloudflared Token Mode & Ingress Rules

**Ngày:** 2026-02-11
**Chủ đề:** Liệu cloudflared có hỗ trợ ĐỒNG THỜI chế độ `--token` VÀ ingress rules không?

---

## Kết Luận Chính

**KHÔNG.** `--token` và `--config` là **LOẠI TRỪ LẪN NHAU (mutually exclusive)**.

- `--token`: Dành cho **remotely-managed tunnels** (quản lý từ Dashboard/API)
- `--config`: Dành cho **locally-managed tunnels** (quản lý qua file config local)

---

## Chi Tiết

### 1. Hai Chế Độ Hoạt Động

#### Remotely-Managed (Token Mode)
- Tạo tunnel qua **Zero Trust Dashboard** hoặc API
- Chạy bằng: `cloudflared tunnel run --token <TOKEN>`
- Config (bao gồm ingress) lưu trên **Cloudflare servers**
- Quản lý ingress: **CHỈ qua Dashboard hoặc API**, KHÔNG qua file local
- Token lấy từ Dashboard lúc tạo tunnel hoặc qua API

#### Locally-Managed (Config File Mode)
- Tạo tunnel bằng: `cloudflared tunnel create <NAME>`
- Chạy bằng: `cloudflared tunnel run --config config.yml <TUNNEL_NAME>`
- Config (bao gồm ingress) lưu trong **file YAML local**
- Ingress rules định nghĩa trong file config:
  ```yaml
  ingress:
    - hostname: api.example.com
      path: /v1/*
      service: http://localhost:3000
    - service: http_status:404  # catch-all bắt buộc
  ```

### 2. Có Thể Kết Hợp `--token` + `--config` Không?

**KHÔNG.** Hai flag này loại trừ lẫn nhau.

- Không thể chạy `cloudflared tunnel run --token <TOKEN> --config config.yml`
- Phải chọn 1 trong 2 chế độ

### 3. Path Routing Với Token Mode

**ĐƯỢC**, nhưng CHỈ config qua **Dashboard/API**, KHÔNG qua file local.

- Remotely-managed tunnels **HỖ TRỢ ingress rules** (hostname + path routing)
- Config ingress qua:
  - **Cloudflare Zero Trust Dashboard**: Networks > Tunnels > [Tunnel] > Public Hostname
  - **Cloudflare API**: `PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations`

**LƯU Ý:**
- Khi đã dùng `--token` (remotely-managed), cloudflared **BỎ QUA file config local**
- Nếu trước đó có file config.yml, sau khi chuyển sang Dashboard mode → file config bị vô hiệu hóa

### 4. Các Flag Khác Của `cloudflared tunnel run`

**Có thể dùng với `--token`:**
- `--token-file <path>`: Đọc token từ file thay vì CLI arg (bảo mật hơn, tránh lộ trong process list)
- `--loglevel <level>`: Mức log (debug/info/warn/error)
- `--logfile <path>`: Ghi log ra file
- `--protocol <protocol>`: Chọn protocol (http2/quic/auto)

**KHÔNG dùng được với `--token`:**
- `--config`: File config (chỉ cho locally-managed)
- `--url`: URL đích (chỉ cho quick tunnel không auth)
- Ingress rules trong config file

### 5. Multiple Services Routing

**Với Token Mode:**
- Config nhiều hostname/path rules qua **Dashboard** hoặc **API**
- Mỗi rule map: hostname + path → local service
- Ví dụ qua Dashboard:
  - `api.example.com` → `http://localhost:3000`
  - `web.example.com/admin/*` → `http://localhost:4000`
  - `*.example.com` → `http://localhost:8080` (catch-all)

**Với Config File:**
```yaml
tunnel: <tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  - hostname: api.example.com
    service: http://localhost:3000
  - hostname: web.example.com
    path: /admin/*
    service: http://localhost:4000
  - service: http_status:404  # catch-all bắt buộc
```

---

## Khuyến Nghị

### Nếu Cần Path Routing + Token:
1. **Dùng remotely-managed tunnel** (khuyến nghị của Cloudflare)
2. Lấy token từ Dashboard
3. Config ingress rules **TẠI Dashboard** (Public Hostname section)
4. Chạy: `cloudflared tunnel run --token <TOKEN>`

### Nếu Cần Flexibility Hơn:
1. **Dùng locally-managed tunnel**
2. Tạo tunnel: `cloudflared tunnel create my-tunnel`
3. Config file với ingress rules chi tiết
4. Chạy: `cloudflared tunnel run --config config.yml my-tunnel`

### Để Bảo Mật Token:
- Dùng `--token-file` thay vì `--token`
- File token đặt permission 600 (chỉ owner đọc)
- Tránh lộ token trong process list

---

## Nguồn

- [Tunnel run parameters · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/run-parameters/)
- [Configuration file · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Configure cloudflared parameters · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/)
- [Create a tunnel (API) · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)
- [Locally-managed tunnels · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/)
- [Edit ingress rules from CLI on a remotely managed installation - Cloudflare Community](https://community.cloudflare.com/t/edit-ingress-rules-from-cli-on-a-remotely-managed-installation/669328)
- [Many services, one cloudflared](https://blog.cloudflare.com/many-services-one-cloudflared/)
- [How to Use Cloudflare Tunnel to Expose Multiple Local Services](https://tech.aufomm.com/how-to-use-cloudflare-tunnel-to-expose-multiple-local-services/)
