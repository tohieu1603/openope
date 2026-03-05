# Nghiên cứu Session Management — Operis Agent

**Date:** 2026-03-05 | **Branch:** Hung | **Status:** Research Report

---

## 1. Tổng quan kiến trúc hiện tại

### 1.1 Storage Model: File-Based JSON5 + JSONL

```
~/.operis/
  agents/{agentId}/
    sessions.json5          ← Metadata store (tất cả sessions trong 1 file)
    {sessionId}.jsonl       ← Transcript (1 file/session, append-only)
```

- **Metadata** (`sessions.json5`): JSON5 object, key = sessionKey, value = `SessionEntry`
- **Transcript** (`{sessionId}.jsonl`): 1 dòng JSON/message, chứa `{type, message, timestamp}`
- **Cache**: In-memory `Map<storePath, {store, loadedAt, mtimeMs}>`, TTL = 45 giây
- **Locking**: File-based `.lock` — poll 25ms, timeout 10s, stale eviction 30s

### 1.2 Data Model — SessionEntry (25+ fields)

```
src/config/sessions/types.ts
```

| Category | Fields |
|----------|--------|
| Identity | `sessionId` (UUID), `updatedAt` (ms timestamp), `sessionFile?` |
| Display | `label?`, `displayName?`, `subject?`, `space?` |
| AI Config | `thinkingLevel`, `verboseLevel`, `reasoningLevel`, `elevatedLevel`, `model`, `modelProvider` |
| Tokens | `inputTokens`, `outputTokens`, `totalTokens`, `contextTokens` |
| Delivery | `channel`, `lastChannel`, `lastTo`, `lastAccountId`, `lastThreadId`, `deliveryContext` |
| Queue | `queueMode`, `queueDebounceMs`, `queueCap` |
| Meta | `origin`, `spawnedBy`, `skillsSnapshot`, `systemPromptReport` |

---

## 2. Luồng hoạt động chi tiết

### 2.1 Tạo Session (Create / Reset)

```
User click "Phiên mới" → handleNewConversation()
  ↓
  RPC "sessions.reset" { key: "agent:main:main" }
  ↓
Gateway (sessions.ts:215-272):
  1. resolveGatewaySessionStoreTarget() → tìm storePath + canonicalKey
  2. updateSessionStore() với file lock:
     a. Re-read sessions.json5 từ disk (skip cache)
     b. Tạo SessionEntry mới:
        - sessionId = randomUUID()      ← UUID mới
        - updatedAt = Date.now()
        - Kế thừa: thinkingLevel, verboseLevel, label, origin, model
        - Reset: inputTokens=0, outputTokens=0, totalTokens=0
     c. Ghi sessions.json5 lại disk
  3. respond({ ok: true, key, entry })
  ↓
Client:
  - Clear chatMessages, chatSessionTokens
  - cacheChatMessages() → localStorage
  - loadGatewaySessions() → refresh danh sách
  - showToast("Đã tạo phiên chat mới")
```

**Quan trọng:** `sessions.reset` KHÔNG tạo file transcript mới. File `.jsonl` chỉ được tạo khi có message đầu tiên được ghi vào.

### 2.2 Hiển thị danh sách Sessions (List)

```
Component mount / User click "Làm mới"
  ↓
loadGatewaySessions() (session-actions.ts:141-165)
  ↓
  RPC "sessions.list" {
    includeGlobal: false,
    includeUnknown: false,
    includeDerivedTitles: true,    ← Đọc tin nhắn đầu tiên làm title
    includeLastMessage: true        ← Đọc tin nhắn cuối cùng
  }
  ↓
Gateway (sessions.ts:46-68 → session-utils.ts:547-724):
  1. loadCombinedSessionStoreForGateway(cfg)
     - Nếu 1 store path: đọc 1 file sessions.json5
     - Nếu template {agentId}: đọc TẤT CẢ agent stores, merge vào combined
     - Mỗi entry được canonicalize key → "agent:{agentId}:{rest}"

  2. listSessionsFromStore() — PIPELINE:
     a. Filter: excludeGlobal, excludeUnknown, agentId, spawnedBy, label
     b. Map: resolve model, delivery context, displayName cho mỗi entry
     c. Sort: by updatedAt DESC
     d. Filter: search (brute-force string.includes trên 5 fields)
     e. Filter: activeMinutes cutoff
     f. Slice: limit
     g. FOR EACH session (O(n) disk I/O):
        - includeDerivedTitles → readFirstUserMessageFromTranscript()
          → Open file, read 8KB, scan 10 lines, find first role="user"
        - includeLastMessage → readLastMessagePreviewFromTranscript()
          → Open file, seek to EOF-16KB, scan 20 lines backwards

  3. Return { sessions: GatewaySessionRow[], defaults, ts, count, path }
  ↓
Client (session-actions.ts:153-161):
  - Filter web-chat only: key starts with "agent:" AND rest has no ":"
    (excludes telegram:*, openai-user:*, cron:*, discord:*)
  - Store vào ctx.gatewaySessions
  ↓
UI (sessions.ts:144-551):
  - renderSessions() với Lit html template
  - Grid layout: repeat(auto-fill, minmax(340px, 1fr))
  - Mỗi card: renderCard() gồm:
    - Header: shortName + badges (kind, time, alive indicator)
    - Label input: inline edit, onchange → sessions.patch
    - Token bar: visual percentage bar (warn >80%, danger >95%)
    - Controls: 3 select dropdowns (thinking, verbose, reasoning)
    - Footer: Delete button
```

### 2.3 Chuyển Session (Switch)

```
User click session card link
  ↓
handleSessionChange(key) (session-actions.ts:169-183)
  ↓
  1. normalizeSessionKey("main") → "agent:main:main"
  2. Nếu key === currentKey → return (skip)
  3. Set ctx.chatConversationId = fullKey
  4. Clear: chatMessages=[], chatStreamingText="", chatToolCalls=[]
  5. persistSessionKey(fullKey) → localStorage
  ↓
loadChatMessagesFromGateway()
  ↓
  RPC "chat.history" { sessionKey, limit: 200 }
  ↓
Gateway (chat.ts):
  1. Load session entry
  2. Locate transcript file
  3. Parse JSONL, extract .message from each line
  4. stripEnvelope() — remove metadata wrapper
  5. capArrayByJsonBytes() — cap at ~512KB
  6. Return messages[]
  ↓
Client:
  - ctx.chatMessages = messages
  - scrollChatToBottom()
```

### 2.4 Gửi tin nhắn (Send)

```
User type + Enter
  ↓
POST /chat/stream (SSE) {
  message, conversationId, attachments?
}
  ↓
Gateway "chat.send":
  1. Deduplicate by idempotencyKey (cache 5min)
  2. Parse + validate attachments (<5MB)
  3. Create AbortController with timeout
  4. dispatchInboundMessage() → agent runs
  ↓
Stream events via WebSocket:
  event: "meta"     → { conversationId }
  event: "delta"    → { text chunk } (throttle 150ms)
  event: "done"     → { usage, model, stopReason }
  event: "error"    → { errorMessage }
  ↓
Client accumulates deltas, on done:
  - Read usage from final event
  - cacheChatMessages() → localStorage
  - Update chatSessionTokens
```

### 2.5 Xóa Session (Delete)

```
User click "Xóa" → showConfirm()
  ↓
deleteSession(key) (session-actions.ts:291-333)
  ↓
  RPC "sessions.delete" { key, deleteTranscript: true }
  ↓
Gateway (sessions.ts:273-364):
  1. Validate: prevent main session deletion
  2. clearSessionQueues() — drain message queues
  3. stopSubagentsForRequester() — stop child agents
  4. abortEmbeddedPiRun() + waitForEmbeddedPiRunEnd(15s)
  5. updateSessionStore(): delete entry from sessions.json5
  6. Archive transcript: rename {sessionId}.jsonl → .deleted.{timestamp}
  ↓
Client:
  - Nếu session hiện tại bị xóa → switch to "main"
  - loadGatewaySessions() → refresh list
  - showToast("Đã xóa session")
```

### 2.6 Compact Session

```
RPC "sessions.compact" { key, maxLines: 400 }
  ↓
Gateway:
  1. Read entire transcript file
  2. If lines > maxLines: archive old file, keep last maxLines
  3. Reset token counts (inputTokens, outputTokens, totalTokens)
```

---

## 3. Kiến trúc WebSocket & Real-time

### 3.1 Connection Model

```
client-web2 ←→ WebSocket ←→ Gateway
  │                              │
  ├─ RPC request/response        ├─ GatewayWsClient { connId, socket, sessionKey? }
  ├─ Event broadcast             ├─ ChatRunRegistry { sessionId → ChatRunEntry[] }
  └─ Tool events                 └─ ToolEventRecipientRegistry { runId → connId[] }
```

### 3.2 Session Event Broadcasting

```
broadcast("chat", payload)         → ALL connected clients
nodeSendToSession(key, "chat", p)  → Clients bound to specific sessionKey
```

**Vấn đề:** Khi session list thay đổi (session mới, xóa, cập nhật), gateway KHÔNG broadcast event "sessions.updated". Client chỉ biết khi tự gọi `sessions.list` lại.

---

## 4. Các hạn chế hiện tại (Detailed)

### 4.1 Performance — O(n) Disk I/O cho mỗi sessions.list

**File:** `session-utils.ts:690-714`

```typescript
// FOR EACH session in list:
if (includeDerivedTitles) {
  readFirstUserMessageFromTranscript(entry.sessionId, storePath, entry.sessionFile);
  // → Open file, read 8KB buffer, scan 10 lines
}
if (includeLastMessage) {
  readLastMessagePreviewFromTranscript(entry.sessionId, storePath, entry.sessionFile);
  // → Open file, seek to EOF-16KB, scan 20 lines
}
```

**Impact:** Với 50 sessions → 100 file open/read operations mỗi lần gọi sessions.list. Tất cả SYNCHRONOUS (`fs.openSync`, `fs.readSync`).

### 4.2 No Real-time Session List Updates

**Hiện tại:**
- Client gọi `loadGatewaySessions()` thủ công khi: mount, refresh, sau reset/delete/patch
- Không có mechanism tự động push khi sessions thay đổi (ví dụ: message mới từ telegram → session.updatedAt thay đổi, nhưng client-web2 không biết)

**Kết quả:** Danh sách sessions trên UI luôn stale cho đến khi user click "Làm mới".

### 4.3 Tất cả sessions trong 1 file JSON

**File:** `store.ts:109-175`

Toàn bộ metadata của TẤT CẢ sessions nằm trong 1 file `sessions.json5`. Mỗi write operation:
1. Acquire lock (poll 25ms)
2. Read TOÀN BỘ file
3. Parse JSON5
4. Modify 1 entry
5. Serialize TOÀN BỘ lại JSON
6. Write TOÀN BỘ file
7. Release lock

**Impact:** Lock contention tăng tuyến tính với số lượng write operations đồng thời.

### 4.4 Cache Invalidation — structuredClone overhead

**File:** `store.ts:119, 167, 174`

```typescript
return structuredClone(cached.store);  // Line 119 — cache hit
SESSION_STORE_CACHE.set(storePath, {
  store: structuredClone(store),       // Line 167 — cache write
});
return structuredClone(store);          // Line 174 — final return
```

Mỗi lần read: 1-2 structuredClone của toàn bộ store. Với 100 sessions × 25+ fields/entry → clone overhead đáng kể.

### 4.5 No Pagination / Cursor-based Loading

**File:** `session-utils.ts:685-688`

```typescript
if (typeof opts.limit === "number") {
  sessions = sessions.slice(0, limit);
}
```

`sessions.list` luôn load toàn bộ store → filter → sort → rồi mới slice. Không có cursor hay offset để load incremental.

### 4.6 Brute-force Search

**File:** `session-utils.ts:673-678`

```typescript
sessions = sessions.filter((s) => {
  const fields = [s.displayName, s.label, s.subject, s.sessionId, s.key];
  return fields.some((f) => typeof f === "string" && f.toLowerCase().includes(search));
});
```

Search thực hiện `String.includes()` trên 5 fields × n sessions. Không có inverted index hay full-text search.

### 4.7 Flat Session List — Không có grouping/folders

UI chỉ có grid cards, không có:
- Folders hay categories
- Pinned/starred sessions
- Archive (ẩn sessions cũ nhưng không xóa)
- Tags

### 4.8 Token Tracking Accuracy

Token counts trong `SessionEntry` chỉ updated khi:
- Chat run hoàn thành → read usage từ transcript
- Session reset → reset về 0
- Session compact → delete token fields

Không có reconciliation mechanism. Nếu gateway crash giữa chừng → token counts có thể sai.

### 4.9 Không có Auto-cleanup

Sessions tích lũy vô hạn. Không có:
- TTL/expiration
- Auto-archive sau N ngày không hoạt động
- Storage quota warning

### 4.10 Monolithic UI File

`sessions.ts` = 668 lines bao gồm:
- CSS (450+ lines styles inline)
- HTML template logic
- State management helpers
- Filter/format functions

Khó test, khó maintain, khó reuse.

### 4.11 Client Filter Logic Duplicated

```typescript
// session-actions.ts:153-160 — Client filters web-chat sessions:
ctx.gatewaySessions = result.sessions.filter((s) => {
  if (!s.key.startsWith("agent:")) return false;
  if (s.kind === "group") return false;
  const rest = shortSessionKey(s.key);
  return !rest.includes(":");
});
```

Gateway trả về tất cả sessions, client filter lại → wasted bandwidth và processing.

### 4.12 Synchronous File I/O trong sessions.list

`readFirstUserMessageFromTranscript` và `readLastMessagePreviewFromTranscript` dùng `fs.openSync`, `fs.readSync` — block event loop cho MỖI session.

---

## 5. Phương án cải thiện

### Approach A: Incremental Improvements (giữ file-based)

**Effort:** Trung bình | **Risk:** Thấp | **Impact:** Trung bình

1. **Cache derived titles + last messages trong SessionEntry**
   - Khi message mới → update `entry.derivedTitle` và `entry.lastMessagePreview` trực tiếp vào sessions.json5
   - `sessions.list` KHÔNG cần đọc transcript files nữa → O(1) thay vì O(n)
   - Tradeoff: sessions.json5 lớn hơn một chút, nhưng loại bỏ hàng chục file reads

2. **WebSocket event "sessions.changed"**
   - Sau mỗi updateSessionStore → broadcast event `{ type: "sessions.changed", keys: [...] }`
   - Client nhận event → gọi lại `sessions.list` (hoặc chỉ load sessions thay đổi)
   - Lightweight, không cần thay đổi storage model

3. **Async file I/O**
   - Chuyển `fs.openSync/readSync` → `fs.promises.open/read`
   - Không block event loop

4. **Server-side filter cho web-chat**
   - Thêm param `surface: "web-chat"` vào `sessions.list`
   - Gateway filter trước, giảm bandwidth

5. **Session list debounce + auto-refresh**
   - Client tự poll mỗi 30-60s (hoặc sau "sessions.changed" event)
   - Debounce rapid filter changes

### Approach B: Hybrid SQLite + JSONL (metadata → SQLite)

**Effort:** Cao | **Risk:** Trung bình | **Impact:** Cao

1. **SQLite cho metadata:**
   - `sessions` table với indexed columns: key, updatedAt, label, kind, derivedTitle
   - FTS5 virtual table cho full-text search
   - Native pagination: `LIMIT/OFFSET` hoặc cursor-based
   - No lock file needed — SQLite built-in locking (WAL mode)

2. **Giữ JSONL cho transcripts** (không thay đổi)
   - Transcript files vẫn là append-only JSONL
   - Hiệu quả cho streaming writes và sequential reads

3. **Migration path:**
   - Startup: scan existing sessions.json5 → import vào SQLite
   - Dual-write phase: ghi cả JSON5 và SQLite, đọc từ SQLite
   - Remove JSON5 sau khi ổn định

4. **Benefits:**
   - Query: `SELECT * FROM sessions WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 20`
   - Search: `SELECT * FROM sessions_fts WHERE sessions_fts MATCH 'keyword'`
   - Pagination native
   - Concurrent reads không cần lock
   - Token tracking có thể dùng SQL aggregate

5. **Risks:**
   - Thêm dependency (better-sqlite3 hoặc sql.js)
   - Schema migration complexity
   - Electron packaging cần native module

### Approach C: Event-Sourced Session State (advanced)

**Effort:** Rất cao | **Risk:** Cao | **Impact:** Rất cao

1. **Mỗi session mutation = event trong event log**
   - `session.created`, `session.message.added`, `session.patched`, `session.deleted`
   - Event log = source of truth

2. **Materialized views cho queries:**
   - Session list view: pre-computed, updated on event
   - Token totals: computed from events, cached

3. **Real-time subscriptions native:**
   - Client subscribe to session list → auto-receive updates

4. **Overkill cho scope hiện tại** — chỉ phù hợp nếu scale multi-user/multi-device.

---

## 6. So sánh Approaches

| Tiêu chí | A: Incremental | B: Hybrid SQLite | C: Event-Sourced |
|----------|:---:|:---:|:---:|
| Effort | Thấp-Trung | Cao | Rất cao |
| Risk | Thấp | Trung bình | Cao |
| Performance gain | 3-5x | 10-50x | 50x+ |
| Search capability | Basic | FTS5 (tốt) | Custom (phức tạp) |
| Pagination | No (vẫn memory) | Native SQL | Custom |
| Real-time updates | Partial (broadcast) | Partial + fast query | Native |
| Migration effort | Minimal | Medium (dual-write) | High (rewrite) |
| Dependencies | None | better-sqlite3 | Custom framework |

---

## 7. Khuyến nghị

**Approach A (Incremental) là phù hợp nhất** cho ngắn-trung hạn:

### Priority 1 — Cache titles vào SessionEntry
- Impact lớn nhất: loại bỏ O(n) disk reads
- Effort nhỏ: chỉ cần update 2-3 files
- Risk gần 0: backward compatible

### Priority 2 — WebSocket "sessions.changed" event
- Giải quyết stale list issue
- Effort nhỏ: thêm 1 broadcast call sau updateSessionStore
- Client chỉ cần listen event và reload

### Priority 3 — Server-side surface filter
- Giảm bandwidth, đơn giản client logic
- Effort nhỏ: thêm 1 filter option

### Priority 4 — Async file I/O
- Unblock event loop
- Effort trung bình: refactor sync → async

**Approach B** nên cân nhắc khi session count vượt 200+ hoặc cần FTS.

---

## 8. Key Code References

| Component | File | Lines |
|-----------|------|-------|
| Session UI (render) | `client-web2/src/ui/views/sessions.ts` | 668 |
| Session actions (CRUD) | `client-web2/src/ui/session-actions.ts` | 411 |
| Chat API + streaming | `client-web2/src/ui/chat-api.ts` | 402 |
| Gateway RPC handlers | `src/gateway/server-methods/sessions.ts` | 482 |
| Session store (cache, lock, R/W) | `src/config/sessions/store.ts` | 467 |
| Session utils (list, resolve, model) | `src/gateway/session-utils.ts` | 725 |
| Transcript file I/O | `src/gateway/session-utils.fs.ts` | 459 |
| Session types | `src/config/sessions/types.ts` | 169 |
| Chat event broadcasting | `src/gateway/server-chat.ts` | 512 |
| Session patch logic | `src/gateway/sessions-patch.ts` | 80+ |

---

## Unresolved Questions

1. Số lượng sessions trung bình hiện tại? (ảnh hưởng priority của pagination)
2. Có plan multi-device/multi-user không? (ảnh hưởng storage decision)
3. Electron build hiện tại có dùng native modules không? (ảnh hưởng SQLite feasibility)
4. Sessions từ telegram/discord có cần hiển thị trên web-chat không? (ảnh hưởng filter logic)
