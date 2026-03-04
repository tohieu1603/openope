# Brainstorm: Phân tích cấu trúc thư mục config & khả năng thay đổi vị trí workspace/cron/session

**Ngày:** 2026-03-02
**Trạng thái:** Hoàn thành phân tích
**Project:** agent.operis (Node.js gateway + Lit frontend + WebSocket)

---

## 1. Tổng quan cấu trúc thư mục hiện tại

### 1.1 State Directory (gốc)

**File chính:** `src/config/paths.ts`

Thư mục gốc (`STATE_DIR`) được resolve theo thứ tự ưu tiên:

1. Biến môi trường `OPENCLAW_STATE_DIR` hoặc `CLAWDBOT_STATE_DIR`
2. Thư mục mới `~/.operis` (nếu tồn tại)
3. Thư mục legacy `~/.openclaw`, `~/.clawdbot`, `~/.moltbot`, `~/.moldbot` (nếu tồn tại)
4. Fallback: `~/.operis` (tạo mới)

**Hằng số export:** `STATE_DIR` (computed 1 lần khi module load)

### 1.2 CONFIG_DIR (alias trong utils.ts)

**File:** `src/utils.ts` (line 248-266)

`CONFIG_DIR = resolveConfigDir()` -- logic gần giống `resolveStateDir` nhưng nằm trong `utils.ts`. Dùng bởi nhiều module: cron, hooks, skills, plugins, credentials, TLS, DNS.

### 1.3 Cấu trúc thư mục bên trong STATE_DIR

```
~/.operis/                          # STATE_DIR / CONFIG_DIR
├── operis.json                     # Config file chính
├── credentials/                    # OAuth, WhatsApp auth
│   ├── oauth.json
│   └── whatsapp/default/
├── agents/
│   └── {agentId}/                  # Mặc định: "main"
│       ├── agent/                  # Agent data (auth-profiles, etc.)
│       └── sessions/               # Session transcripts
│           ├── sessions.json       # Session store
│           └── *.jsonl             # Individual session files
├── workspace/                      # DEFAULT workspace (AGENTS.md, SOUL.md, etc.)
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── HEARTBEAT.md
│   ├── BOOTSTRAP.md
│   ├── MEMORY.md
│   ├── hooks/                      # Workspace hooks
│   └── skills/                     # Workspace skills
├── workspace-{profile}/            # Profile-specific workspace
├── workspace-{agentId}/            # Per-agent workspace (non-default)
├── cron/
│   └── jobs.json                   # Cron job store
├── hooks/                          # Managed hooks
├── skills/                         # Managed skills
├── plugins/                        # Installed plugins
└── logs/                           # Log files
```

---

## 2. Chi tiết từng thư mục

### 2.1 Workspace Directory

**Files liên quan:**
- `src/agents/workspace.ts` -- `resolveDefaultAgentWorkspaceDir()`, `ensureAgentWorkspace()`
- `src/agents/agent-scope.ts` -- `resolveAgentWorkspaceDir()`

**Logic resolve:**

| Ưu tiên | Nguồn | Đường dẫn |
|---------|-------|-----------|
| 1 | `agents.list[].workspace` (per-agent config) | Custom path |
| 2 | `agents.defaults.workspace` (config file) | Custom path |
| 3 | `OPENCLAW_PROFILE` env var | `~/.operis/workspace-{profile}` |
| 4 | Default | `~/.operis/workspace` |
| 5 | Non-default agent fallback | `~/.operis/workspace-{agentId}` |

**Nơi sử dụng (production code):**
- `src/agents/workspace.ts` -- tạo workspace, bootstrap files (AGENTS.md, SOUL.md, etc.)
- `src/agents/agent-scope.ts:167-182` -- resolve workspace dir cho agent
- `src/auto-reply/reply/get-reply.ts` -- lấy workspace dir khi xử lý reply
- `src/commands/setup.ts` -- setup command tạo workspace
- `src/commands/onboard-helpers.ts` -- onboarding flow
- `src/agents/sandbox/context.ts` -- sandbox workspace
- `src/hooks/workspace.ts` -- load hooks từ workspace
- `src/agents/skills/workspace.ts` -- load skills từ workspace
- `src/hooks/bundled/session-memory/handler.ts` -- hardcoded fallback `~/.operis/workspace`

**Hardcoded paths (van de):**
- `src/agents/workspace.ts:15,17` -- `path.join(homedir(), ".operis", "workspace")`
- `src/agents/agent-scope.ts:181` -- `path.join(os.homedir(), ".operis", "workspace-{id}")`
- `src/hooks/bundled/session-memory/handler.ts:79` -- `path.join(os.homedir(), ".operis", "workspace")`

### 2.2 Session Directory

**Files liên quan:**
- `src/config/sessions/paths.ts` -- `resolveAgentSessionsDir()`, `resolveSessionTranscriptsDir()`
- `src/config/sessions/store.ts` -- session store I/O
- `src/config/sessions/transcript.ts` -- transcript read/write

**Logic resolve:**
```
{STATE_DIR}/agents/{agentId}/sessions/
```

- Moi session duoc luu thanh file `.jsonl` trong thu muc nay
- Session store (`sessions.json`) chua metadata cua tat ca sessions
- **Cau hinh override:** `session.store` trong config cho phep thay doi duong dan session store file, nhung KHONG thay doi session transcripts directory

**Noi su dung:**
- `src/config/sessions/paths.ts` -- tat ca session path resolution
- `src/commands/setup.ts:72-73` -- tao sessions dir
- `src/commands/onboard-helpers.ts:269` -- tao sessions dir
- `src/infra/state-migrations.ts` -- migrate legacy sessions
- `src/memory/manager.ts`, `src/memory/session-files.ts` -- memory sync tu session files
- `src/agents/session-write-lock.ts` -- session file locking

### 2.3 Cron Directory

**Files liên quan:**
- `src/cron/store.ts` -- `DEFAULT_CRON_DIR`, `DEFAULT_CRON_STORE_PATH`, `resolveCronStorePath()`

**Logic resolve:**
```
DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron")
DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json")
```

- **Cau hinh override:** `cron.store` trong config cho phep chi dinh duong dan custom cho cron store file
- `resolveCronStorePath()` xu ly override va fallback

**Noi su dung:**
- `src/cron/store.ts` -- load/save cron store (tao dir tu dong voi `mkdir -p`)
- `src/gateway/server-cron.ts` -- gateway khoi tao cron

---

## 3. Co the thay doi vi tri khong?

### 3.1 Da co san mechanism override

| Thu muc | Co the override | Cach override |
|---------|----------------|---------------|
| **STATE_DIR** (goc) | Co | Env: `OPENCLAW_STATE_DIR` |
| **Config file** | Co | Env: `OPENCLAW_CONFIG_PATH` |
| **Workspace** | Co | Config: `agents.defaults.workspace` hoac `agents.list[].workspace` |
| **Session store file** | Co (1 phan) | Config: `session.store` -- chi thay doi store path, khong thay doi transcripts dir |
| **Session transcripts dir** | **Khong** | Luon nam trong `{STATE_DIR}/agents/{agentId}/sessions/` |
| **Cron store file** | Co | Config: `cron.store` |
| **Cron directory** | **Khong truc tiep** | Chi override duoc qua `OPENCLAW_STATE_DIR` (thay doi toan bo STATE_DIR) |
| **OAuth dir** | Co | Env: `OPENCLAW_OAUTH_DIR` |
| **Agent dir** | Co | Env: `OPENCLAW_AGENT_DIR` hoac config: `agents.list[].agentDir` |

### 3.2 Han che hien tai

1. **Session transcripts dir** -- KHONG co cach override rieng, luon bind vao `STATE_DIR/agents/{agentId}/sessions/`
2. **Workspace hardcoded paths** -- 3 cho hardcode `.operis` truc tiep thay vi dung `STATE_DIR`:
   - `workspace.ts:15,17`
   - `agent-scope.ts:181`
   - `session-memory/handler.ts:79`
3. **CONFIG_DIR vs STATE_DIR duplication** -- `utils.ts:resolveConfigDir()` la ban sao cua `paths.ts:resolveStateDir()`, gay nguy co out-of-sync
4. **daemon/paths.ts** -- Van dung `.openclaw` (chua migrate sang `.operis`), line 41

---

## 4. Anh huong khi thay doi

### 4.1 Thay doi vi tri workspace (AN TOAN NHAT)

**Risk: THAP**

Workspace da co override mechanism hoan chinh qua config:
```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/custom/workspace"
    }
  }
}
```

Hoac per-agent:
```json
{
  "agents": {
    "list": [
      { "id": "main", "workspace": "/path/to/custom/workspace" }
    ]
  }
}
```

**Anh huong:**
- Hooks va skills duoc load tu `{workspace}/hooks/` va `{workspace}/skills/` -- tu dong theo workspace moi
- Bootstrap files (AGENTS.md, SOUL.md, etc.) se duoc tao o workspace moi
- Workspace cu van ton tai, khong tu dong migrate files
- Memory sync doc session files tu sessions dir, doc workspace files tu workspace dir -- hai dir doc lap

### 4.2 Thay doi vi tri session (CAN THAN)

**Risk: TRUNG BINH - CAO**

Hien khong co override rieng cho session transcripts dir. Cac anh huong:

1. **Memory system** -- `src/memory/session-files.ts`, `src/memory/manager.ts` doc `.jsonl` files tu sessions dir de sync memory. Thay doi path ma khong update memory module se mat memory sync.
2. **Session write lock** -- `src/agents/session-write-lock.ts` tao lock files trong sessions dir
3. **State migrations** -- `src/infra/state-migrations.ts` migrate sessions tu legacy paths. Code nay assume cau truc `agents/{agentId}/sessions/`
4. **Doctor command** -- `src/commands/doctor-state-integrity.ts` kiem tra integrity cua session files

### 4.3 Thay doi vi tri cron (TUONG DOI AN TOAN)

**Risk: THAP**

Da co override qua `cron.store`:
```json
{
  "cron": {
    "store": "/path/to/custom/cron/jobs.json"
  }
}
```

**Anh huong:**
- Chi anh huong file `jobs.json`, khong co side effects khac
- `saveCronStore()` tu dong tao parent directory

---

## 5. Phuong an thay doi

### Phuong an A: Override bang config (Khuyen nghi - KHONG can sua code)

**Workspace:** Dung `agents.defaults.workspace` hoac `agents.list[].workspace`
**Cron:** Dung `cron.store`
**Toan bo STATE_DIR:** Dung env `OPENCLAW_STATE_DIR`

Pro:
- Khong can sua code
- Da duoc test va su dung

Con:
- Khong the tach rieng session transcripts dir ra khoi STATE_DIR
- Hardcoded fallback paths trong workspace.ts van tro ve `~/.operis/workspace`

### Phuong an B: Them config options moi cho session dir (Sua code)

Them truong moi vao config type:

```typescript
// src/config/types.base.ts
export type SessionConfig = {
  // ... existing fields
  transcriptsDir?: string;  // NEW: override session transcripts directory
};
```

Sua `src/config/sessions/paths.ts`:
```typescript
function resolveAgentSessionsDir(
  agentId?: string,
  env = process.env,
  homedir = os.homedir,
  transcriptsDir?: string,  // NEW parameter
): string {
  if (transcriptsDir?.trim()) {
    const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
    return path.join(resolveUserPath(transcriptsDir), id);
  }
  const root = resolveStateDir(env, homedir);
  const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
  return path.join(root, "agents", id, "sessions");
}
```

**Files can sua:**
1. `src/config/types.base.ts` -- them `transcriptsDir` vao `SessionConfig`
2. `src/config/sessions/paths.ts` -- sua resolve functions
3. `src/config/zod-schema.core.ts` -- them validation
4. `src/config/schema.ts` -- them label
5. Cap nhat tat ca callers truyen config vao session path resolution (~12 files)

**Risk:**
- Trung binh -- can test ky memory sync, session write lock, state migrations
- Can dam bao backward compatible (khong co `transcriptsDir` thi giu behavior cu)

### Phuong an C: Fix hardcoded paths (Sua code - Nho)

Chi sua 3 hardcoded `.operis` paths de dung `STATE_DIR` thay vi hardcode:

1. `src/agents/workspace.ts:9-18` -- dung `resolveStateDir()` thay vi hardcode `.operis`
2. `src/agents/agent-scope.ts:181` -- tuong tu
3. `src/hooks/bundled/session-memory/handler.ts:79` -- tuong tu

**Risk: THAP** -- chi la refactor, khong thay doi behavior khi `STATE_DIR = ~/.operis`

---

## 6. Khuyen nghi

### Lam ngay (khong can code change):
- Dung `agents.defaults.workspace` de override workspace path
- Dung `cron.store` de override cron store path
- Dung `OPENCLAW_STATE_DIR` env de thay doi toan bo state directory (bao gom sessions)

### Lam sau (can code change, uu tien theo risk):
1. **Phuong an C** truoc -- Fix hardcoded paths, low risk, giup `OPENCLAW_STATE_DIR` hoat dong nhat quan
2. **Phuong an B** neu can -- Them `session.transcriptsDir` config, cho phep tach session dir ra khoi state dir
3. Fix `daemon/paths.ts:41` -- van dung `.openclaw` thay vi `.operis`
4. Merge `utils.ts:resolveConfigDir()` voi `paths.ts:resolveStateDir()` de tranh duplication

---

## 7. Dependency Map

```
resolveStateDir() [src/config/paths.ts]
  |
  +-- STATE_DIR (exported constant)
  |     |
  |     +-- resolveCanonicalConfigPath() --> CONFIG_PATH
  |     +-- resolveOAuthDir() --> credentials/
  |     +-- resolveAgentSessionsDir() [sessions/paths.ts] --> agents/{id}/sessions/
  |     +-- resolveEffectiveAgentDir() [agent-dirs.ts] --> agents/{id}/agent/
  |
  +-- resolveConfigDir() [utils.ts] --> CONFIG_DIR
        |
        +-- DEFAULT_CRON_DIR [cron/store.ts] --> cron/
        +-- managed hooks dir --> hooks/
        +-- managed skills dir --> skills/
        +-- credentials dir fallback

resolveDefaultAgentWorkspaceDir() [workspace.ts]  ** HARDCODED ~/.operis/workspace **
  |
  +-- DEFAULT_AGENT_WORKSPACE_DIR
  +-- resolveAgentWorkspaceDir() [agent-scope.ts]
        |
        +-- per-agent config override
        +-- defaults.workspace override
        +-- fallback to DEFAULT_AGENT_WORKSPACE_DIR
```

---

## 8. Cau hoi chua giai quyet

1. **daemon/paths.ts** con dung `.openclaw` -- co can migrate khong? Lieu Electron desktop app co depend vao path nay?
2. **Memory sync** -- khi thay doi session dir, memory re-index co tu dong chay lai khong hay can manual trigger?
3. **OPENCLAW_STATE_DIR** rename -- co ke hoach doi thanh `OPERIS_STATE_DIR` khong? Hien tai van dung ten cu.
4. Co can migrate data tu vi tri cu sang vi tri moi khi thay doi workspace/session path khong? Hay chi apply cho data moi?
