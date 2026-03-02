# Brainstorm: Browser Profile Fallback Bug

## Problem Statement

When agent opens browser with `profile="operis"` then performs subsequent actions (snapshot, fill form, act), the internal service falls back to default profile instead of maintaining the "operis" profile context. This causes commands to target wrong browser instance.

## Root Cause Analysis

### Data Flow (Happy Path vs Actual)

**Expected:** `open(profile="operis")` → `snapshot(profile="operis")` → `act(profile="operis")`
**Actual:** `open(profile="operis")` → `snapshot(profile=undefined)` → `act(profile=undefined)`

### 5-Step Failure Chain

1. **browser-tool.ts:246** — `profile = readStringParam(params, "profile")` returns `undefined` when LLM agent omits profile param in subsequent calls
2. **client.ts:89-91** — `buildProfileQuery(undefined)` returns `""` → no `?profile=` query parameter sent to server
3. **routes/utils.ts:13-26** — `getProfileContext()` finds no profile in query/body → `profileName = undefined`
4. **server-context.ts:570-572** — `forProfile(undefined)` falls back to `current.resolved.defaultProfile`
5. **config.ts:205-209** — `defaultProfile` resolves to `"chrome"` (if chrome extension profile exists) or `"operis"` — NOT necessarily the profile used for `open`

### Why the LLM Agent Omits Profile

- Tool description in `browser-tool.ts:231-241` mentions profiles but doesn't enforce passing profile on every call
- LLM assumes "open with profile=X" establishes session context (like a session cookie)
- No error/warning when profile is omitted — silently uses default

### Two Browser Systems (Confusion Source)

| System | Profile Mechanism | Session |
|--------|------------------|---------|
| **Built-in browser tool** (`src/browser/`) | `profile` param per call (operis/chrome) | Stateless per-request |
| **agent-browser CLI** (npm package) | `--session`, `AGENT_BROWSER_PROFILE` env | Persistent named sessions |

The `agent-browser` CLI has its own session/profile system completely unrelated to operis's internal profiles. If agent uses `agent-browser` commands, it uses a different profile mechanism entirely.

## Evaluated Approaches

### Option A: Sticky Profile in browser-tool.ts (Recommended)

**Approach:** Add module-level `lastUsedProfile` variable. When profile is undefined, default to last-used profile rather than server default.

```typescript
// browser-tool.ts
let lastUsedProfile: string | undefined;

// In execute():
const profile = readStringParam(params, "profile") ?? lastUsedProfile;
if (profile) lastUsedProfile = profile;
```

**Pros:**
- Minimal change (3 lines)
- Fixes root cause at caller level
- No server changes needed
- Backward compatible — still falls back to server default if never set

**Cons:**
- Per-process state (resets on gateway restart)
- If agent intentionally switches profiles, sticky behavior could confuse

### Option B: Tab-to-Profile Mapping on Server

**Approach:** Store `targetId → profileName` mapping. When request includes `targetId` but no `profile`, auto-resolve profile from the tab's origin profile.

```typescript
// server-context.types.ts
type BrowserServerState = {
  // ... existing fields
  tabProfileMap: Map<string, string>; // targetId → profileName
};
```

**Pros:**
- Architecturally correct — tab knows its profile
- Works for multi-profile scenarios
- No client-side changes

**Cons:**
- More complex — touch server-context, all tab creation/deletion paths
- Need cleanup when tabs close
- Doesn't help when targetId is also omitted

### Option C: Improve Tool Description / LLM Prompt

**Approach:** Make profile parameter emphasis stronger in tool description so LLM always includes it.

```typescript
description: [
  "IMPORTANT: Always pass profile= on EVERY call (open/snapshot/act/screenshot/etc). ",
  "Profile is NOT remembered between calls. If omitted, defaults to system default.",
  // ... existing description
]
```

**Pros:**
- No code change
- Addresses root cause (LLM behavior)

**Cons:**
- Unreliable — LLM may still omit it
- Takes up tool description token budget
- Doesn't fix the architectural gap

### Option D: Set defaultProfile in User Config

**Approach:** User sets `browser.defaultProfile: "operis"` in `~/.operis/operis.json`

**Pros:**
- Zero code changes
- Immediate fix

**Cons:**
- Band-aid — doesn't fix the stateless profile issue
- User must remember to configure
- Doesn't help if user needs both profiles

## Recommended Solution

**Option A + C (combined):**

1. **Sticky profile** in browser-tool.ts — 3 lines of code, fixes 95% of cases
2. **Improved tool description** — make it explicit that profile should be passed

This is the KISS approach. Option B is architecturally cleaner but over-engineered for the actual problem.

## Implementation Considerations

- `lastUsedProfile` should reset when `action="stop"` is called
- Consider per-agent-session scope if multiple agents share same gateway
- Test: open with operis → snapshot without profile → verify uses operis
- Test: open with operis → open with chrome → snapshot without profile → verify uses chrome (last used)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sticky profile causes wrong profile after explicit switch | Low | Medium | Reset on `action="stop"` |
| Multiple concurrent agents conflict on lastUsedProfile | Low | Low | Scope to tool instance (closure) |
| agent-browser CLI confusion | Medium | Low | Document the two systems clearly |

## Success Metrics

- Agent can open page with `profile="operis"` and subsequent snapshot/act calls work without explicit profile
- No regression for `profile="chrome"` (extension relay) workflows
- Existing tests pass unchanged

## Unresolved Questions

1. Is the user using the built-in `browser` tool or the `agent-browser` CLI? (Both have different profile systems)
2. Should `lastUsedProfile` be scoped per-agent-session or globally per gateway?
3. Does the user have `browser.defaultProfile` set in their config?
