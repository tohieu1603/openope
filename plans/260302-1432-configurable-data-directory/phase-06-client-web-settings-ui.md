---
title: "Phase 6: Client-Web Settings UI for userDataDir"
status: pending
effort: 2h
---

# Phase 6: Client-Web Settings UI for userDataDir

## Context Links

- [plan.md](./plan.md) — overview
- [Phase 4](./phase-04-api-endpoint.md) — `config.userDataDir.set` gateway API
- `client-web/src/ui/views/settings.ts` — existing Settings view (1,021 lines)
- `client-web/src/ui/app.ts` — Settings controller (state + handlers)
- `client-web/src/ui/gateway-client.ts` — WebSocket `request()` method
- `src/gateway/server-methods/config.ts` — `config.get` response format + baseHash

## Overview

- **Priority:** Medium (enables post-install data dir changes)
- **Risk:** Low — follows existing Settings patterns (profile edit, password change)
- **Description:** Add "Data Storage" section to Settings UI. Shows current `userDataDir`, text input to change path, calls `config.userDataDir.set` API via gateway WebSocket. Displays migration results and restart notification.

## Key Insights

1. **Settings pattern established:** Profile name edit uses inline input + save/cancel. Password change uses expandable form. Data dir follows same pattern.
2. **Gateway WebSocket for config:** `gateway-client.ts` has `request(method, params)` — same pattern as other config calls
3. **baseHash required:** Must call `config.get` first to get current hash, then pass to `config.userDataDir.set`
4. **Toast notifications:** `showToast(message, type)` utility already available in app.ts
5. **No native file dialog in web:** Use text input for path. Electron users type or paste path (e.g., `C:\Users\Name\Desktop\OperisAgent`).
6. **Vietnamese UI text:** Existing settings use Vietnamese labels ("Đổi mật khẩu", "Cập nhật")

## Requirements

### Functional
- New "Thư mục lưu trữ" (Data Storage) section in Settings view
- Display current `userDataDir` path (from `config.get` response)
- Text input to enter new path
- "Lưu" (Save) button → calls `config.userDataDir.set` with path + baseHash
- Show migration results: migrated dirs, skipped, warnings
- Show restart notification ("Gateway sẽ khởi động lại trong 3 giây")
- Disable form during save (loading state)
- Error handling: stale baseHash → auto-retry with fresh hash

### Non-Functional
- Consistent with existing Settings UI patterns
- Responsive layout matching other settings sections
- No external dependencies added

## Architecture

### Data Flow
```
Settings tab opened
  → app.ts loadSettingsConfig()
    → gateway.request("config.get")
    → Extract userDataDir + baseHash from response
    → Pass to settings view as props

User changes path + clicks Save
  → app.ts handleChangeDataDir(newPath)
    → gateway.request("config.userDataDir.set", { path, baseHash })
    → On success: show migration results + restart toast
    → On stale hash: retry with fresh config.get
    → On error: show error toast
```

### Component Structure
```
SettingsView
├── Profile Section (existing)
├── Channels Section (existing)
├── Data Storage Section (NEW)
│   ├── Current path display
│   ├── Path input + Save button
│   └── Migration results (conditional)
├── Security Section (existing)
└── Danger Zone (existing)
```

## Related Code Files

| File | Change |
|------|--------|
| `client-web/src/ui/views/settings.ts` | Add "Data Storage" section with path input |
| `client-web/src/ui/app.ts` | Add state props, load config, handle save |

## Implementation Steps

### Step 1: Add state to app.ts

```typescript
// New state properties (alongside existing settings state)
@state() settingsUserDataDir: string = "";
@state() settingsNewDataDir: string = "";
@state() settingsConfigHash: string = "";
@state() settingsDataDirSaving = false;
@state() settingsDataDirResult: {
  migrated?: string[];
  skipped?: string[];
  warnings?: string[];
  restartScheduled?: boolean;
} | null = null;
```

### Step 2: Load config on settings tab

```typescript
private async loadSettingsConfig() {
  try {
    const res = await this.gatewayClient.request<{
      config: { userDataDir?: string };
      hash: string;
    }>("config.get", { sections: ["userDataDir"] });

    this.settingsUserDataDir = res.config?.userDataDir || "";
    this.settingsNewDataDir = res.config?.userDataDir || "";
    this.settingsConfigHash = res.hash || "";
  } catch (err) {
    console.error("[settings] Failed to load config:", err);
  }
}
```

Call from `loadSettingsData()` (existing method called when settings tab opens):

```typescript
private async loadSettingsData() {
  await Promise.all([
    this.loadUserProfile(),
    this.loadChannels(),
    this.loadSettingsConfig(),  // NEW
  ]);
}
```

### Step 3: Add save handler

```typescript
private async handleChangeDataDir() {
  const newPath = this.settingsNewDataDir.trim();
  if (!newPath) return;

  this.settingsDataDirSaving = true;
  this.settingsDataDirResult = null;

  try {
    const res = await this.gatewayClient.request<{
      userDataDir: string;
      migrated: string[];
      skipped: string[];
      warnings: string[];
      restartScheduled: boolean;
      restartDelayMs: number;
    }>("config.userDataDir.set", {
      path: newPath,
      baseHash: this.settingsConfigHash,
    });

    this.settingsUserDataDir = res.userDataDir;
    this.settingsDataDirResult = {
      migrated: res.migrated,
      skipped: res.skipped,
      warnings: res.warnings,
      restartScheduled: res.restartScheduled,
    };

    if (res.restartScheduled) {
      showToast(
        `Đã cập nhật. Gateway khởi động lại trong ${res.restartDelayMs / 1000}s`,
        "success"
      );
    } else {
      showToast("Đã cập nhật thư mục lưu trữ", "success");
    }

    // Refresh config hash after change
    await this.loadSettingsConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Không thể cập nhật";

    // Auto-retry on stale hash
    if (msg.includes("config changed since last load")) {
      await this.loadSettingsConfig();
      showToast("Config đã thay đổi, vui lòng thử lại", "warning");
    } else {
      showToast(msg, "error");
    }
  } finally {
    this.settingsDataDirSaving = false;
  }
}
```

### Step 4: Add Data Storage section to settings.ts

Add props to `SettingsProps`:

```typescript
export interface SettingsProps {
  // ... existing props

  // Data storage
  userDataDir: string;
  newDataDir: string;
  dataDirSaving: boolean;
  dataDirResult: {
    migrated?: string[];
    skipped?: string[];
    warnings?: string[];
    restartScheduled?: boolean;
  } | null;
  onNewDataDirChange: (value: string) => void;
  onSaveDataDir: () => void;
}
```

Add render section (insert before Security section):

```typescript
function renderDataStorageSection(props: SettingsProps): TemplateResult {
  const hasChanges = props.newDataDir.trim() !== props.userDataDir;

  return html`
    <div class="settings-section">
      <h3 class="section-title">Thư mục lưu trữ</h3>
      <p class="section-desc">
        Thư mục chứa workspace, skills và cron. Thay đổi sẽ di chuyển dữ liệu sang vị trí mới.
      </p>

      <div class="datadir-form">
        <label class="form-label">Đường dẫn thư mục</label>
        <div class="datadir-input-row">
          <input
            type="text"
            class="datadir-input"
            .value=${props.newDataDir}
            @input=${(e: Event) =>
              props.onNewDataDirChange((e.target as HTMLInputElement).value)}
            placeholder="C:\\Users\\...\\Desktop\\OperisAgent"
            ?disabled=${props.dataDirSaving}
          />
          <button
            class="btn btn-primary"
            ?disabled=${!hasChanges || props.dataDirSaving}
            @click=${props.onSaveDataDir}
          >
            ${props.dataDirSaving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>

        ${props.userDataDir
          ? html`<p class="current-path">Hiện tại: <code>${props.userDataDir}</code></p>`
          : html`<p class="current-path">Mặc định: <code>~/.operis/</code></p>`}
      </div>

      ${props.dataDirResult ? renderMigrationResult(props.dataDirResult) : ""}
    </div>
  `;
}

function renderMigrationResult(result: NonNullable<SettingsProps["dataDirResult"]>): TemplateResult {
  return html`
    <div class="migration-result">
      ${result.migrated?.length
        ? html`<p class="result-success">
            Di chuyển thành công: ${result.migrated.join(", ")}
          </p>`
        : ""}
      ${result.skipped?.length
        ? html`<p class="result-info">
            Bỏ qua: ${result.skipped.join(", ")}
          </p>`
        : ""}
      ${result.warnings?.length
        ? html`<div class="result-warnings">
            ${result.warnings.map(w => html`<p class="result-warning">${w}</p>`)}
          </div>`
        : ""}
      ${result.restartScheduled
        ? html`<p class="result-restart">Gateway sẽ khởi động lại...</p>`
        : ""}
    </div>
  `;
}
```

### Step 5: Add CSS styles

```css
.datadir-form {
  margin-top: 12px;
}
.datadir-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.datadir-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
}
.datadir-input:focus {
  border-color: var(--accent-color, #6366f1);
  outline: none;
}
.current-path {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
}
.current-path code {
  background: var(--bg-code, #f1f5f9);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.migration-result {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-subtle, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
}
.result-success { color: #16a34a; margin: 4px 0; }
.result-info { color: #64748b; margin: 4px 0; }
.result-warning { color: #d97706; margin: 4px 0; }
.result-restart {
  color: #6366f1;
  font-weight: 500;
  margin-top: 8px;
}
```

### Step 6: Wire props in app.ts render

```typescript
// In the settings tab render:
${renderSettings({
  // ... existing props
  userDataDir: this.settingsUserDataDir,
  newDataDir: this.settingsNewDataDir,
  dataDirSaving: this.settingsDataDirSaving,
  dataDirResult: this.settingsDataDirResult,
  onNewDataDirChange: (v: string) => { this.settingsNewDataDir = v; },
  onSaveDataDir: () => this.handleChangeDataDir(),
})}
```

### Step 7: Compile and test

```bash
cd client-web && pnpm build
# Manual test: open settings, change data dir path, verify API call
```

## Todo List

- [ ] Add state properties to app.ts
- [ ] Add `loadSettingsConfig()` method
- [ ] Add `handleChangeDataDir()` method
- [ ] Add Data Storage section to settings.ts
- [ ] Add `renderMigrationResult()` helper
- [ ] Add CSS styles
- [ ] Wire props in app.ts render
- [ ] Compile check

## Success Criteria

1. Settings → "Thư mục lưu trữ" section visible with current path
2. Enter new path + Save → calls `config.userDataDir.set` via gateway
3. Success → shows migration results (migrated, skipped, warnings)
4. Restart notification shown when gateway restart scheduled
5. Stale hash → auto-refreshes, shows "try again" toast
6. Form disabled during save (no double-submit)
7. Empty/unchanged path → Save button disabled

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gateway disconnects during save | Low | Low | Error toast; user retries |
| User enters invalid path | Low | Medium | Gateway validates; error returned |
| Config hash race with other tabs | Very Low | Low | Auto-retry with fresh hash |

## Security Considerations

- Path validation done on gateway side (resolveUserPath + path.resolve)
- Admin scope required for `config.userDataDir.set`
- No path traversal — gateway normalizes via path.resolve
- WebSocket auth ensures only authenticated users can change config

## Next Steps

This completes the full userDataDir feature:
- Phase 1-4: Gateway core (path resolution, migration, API)
- Phase 5: NSIS installer (initial setup)
- Phase 6: Client-web UI (post-install changes)
