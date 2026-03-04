# Research Report: PostgreSQL Top-1-Per-Group at Scale

**Date:** 2026-03-02
**Context:** `chat_messages(id, user_id, conversation_id, role, content, created_at)` — get latest message per conversation for a given user, ordered by recency, LIMIT 20.

---

## Executive Summary

The "top-1-per-group" problem is one of PostgreSQL's most studied performance challenges. Six canonical approaches exist; **for this specific workload** (single-user filter → small per-user dataset → LIMIT 20), **LATERAL JOIN with a composite index is the clear winner** — it executes O(20) index seeks instead of scanning the full user dataset. `DISTINCT ON` is a viable fallback if you stay on PG ≤ 17. PostgreSQL 18 introduces native **Skip Scan** which may eventually eliminate the need for query rewrites, but its current form has cardinality limitations that make it less ideal here. The recursive CTE (loose index scan) is the right tool when the group column (conversation_id) has very high cardinality and no equality filter on it — not the primary case here.

---

## Table of Contents

1. [Problem Restatement](#1-problem-restatement)
2. [Index Strategy — The Prerequisite](#2-index-strategy)
3. [Approach Comparison](#3-approach-comparison)
   - 3.1 DISTINCT ON
   - 3.2 ROW_NUMBER() Window Function
   - 3.3 LATERAL JOIN (recommended)
   - 3.4 MAX() + Self-Join
   - 3.5 Recursive CTE / Loose Index Scan
   - 3.6 PostgreSQL 18 Skip Scan
4. [Performance at Scale](#4-performance-at-scale)
5. [Final Recommendation](#5-final-recommendation)
6. [Unresolved Questions](#6-unresolved-questions)
7. [Sources](#7-sources)

---

## 1. Problem Restatement

```sql
-- Goal: for user $1, get the 20 most-recently-active conversations
-- showing only the latest message per conversation

SELECT DISTINCT ON (conversation_id)
  id, conversation_id, role, content, created_at
FROM chat_messages
WHERE user_id = $1
ORDER BY conversation_id, created_at DESC;
-- Problem: result is ordered by conversation_id, not by created_at DESC
-- Cannot add secondary ORDER BY without violating DISTINCT ON rules
```

**Scale context:**
- Total table: millions–hundreds of millions of rows
- Per-user rows: typically 100–50,000 (small slice after `WHERE user_id = $1`)
- Per user: 10–500 conversations, each 1–1,000 messages
- Output: only 20 rows

---

## 2. Index Strategy

This is the most critical decision — the right index makes all approaches fast.

### Option A: Primary composite index (recommended)
```sql
CREATE INDEX idx_chat_messages_user_conv_time
  ON chat_messages (user_id, conversation_id, created_at DESC);
```
- `user_id` first → equality filter prunes to per-user slice instantly
- `conversation_id` second → groups messages within user's slice
- `created_at DESC` third → first row per group is the latest (enables index-only group traversal)
- This is a **covering** index for the GROUP lookup; add INCLUDE for payload columns:

```sql
CREATE INDEX idx_chat_messages_user_conv_time
  ON chat_messages (user_id, conversation_id, created_at DESC)
  INCLUDE (role, content, id);
```
INCLUDE columns (PG 11+) sit in leaf pages only; they satisfy the SELECT without a heap fetch, giving an **Index-Only Scan**.

### Option B: Simpler fallback
```sql
CREATE INDEX idx_chat_messages_user_time
  ON chat_messages (user_id, created_at DESC);
```
Good for queries that need the latest N messages across all conversations, but suboptimal for grouping by conversation_id.

### What NOT to do
- Index only on `user_id`: forces a seq scan of all user's rows
- Index on `(conversation_id, created_at DESC)` without `user_id`: PG must merge many index entries to filter by user
- Separate indexes on each column: bitmap index merge is slower than a covering composite

---

## 3. Approach Comparison

### 3.1 DISTINCT ON

```sql
SELECT DISTINCT ON (conversation_id)
  id, conversation_id, role, content, created_at
FROM chat_messages
WHERE user_id = $1
ORDER BY conversation_id, created_at DESC;
```

**To get results sorted by most-recent conversation first**, wrap it:

```sql
SELECT *
FROM (
  SELECT DISTINCT ON (conversation_id)
    id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
  ORDER BY conversation_id, created_at DESC
) latest_msgs
ORDER BY created_at DESC
LIMIT 20;
```

**Index:** `(user_id, conversation_id, created_at DESC)` — PG uses an **Index Scan**, scanning the index in order, emitting one row per conversation_id group.

**EXPLAIN ANALYZE pattern:**
```
Index Scan using idx_chat_messages_user_conv_time on chat_messages
  Index Cond: (user_id = $1)
  -> Sort (actual rows=N, loops=1)   ← outer sort for final ORDER BY
```

**Behavior:**
- Reads ALL conversations for the user, picks latest per group, THEN sorts and LIMITs
- Cost: O(all user rows) — acceptable when per-user count is small
- Sorting limitation: `ORDER BY` must start with the `DISTINCT ON` columns; can't directly `ORDER BY created_at DESC` as primary sort
- The outer wrapper query adds a Sort node — acceptable overhead

**Pros:** Simple, readable, idiomatic PostgreSQL
**Cons:** Sorts all user's rows before applying LIMIT; cannot early-exit after finding 20 conversations; no native "skip to next group" capability in PG ≤ 17

---

### 3.2 ROW_NUMBER() Window Function

```sql
SELECT id, conversation_id, role, content, created_at
FROM (
  SELECT
    id, conversation_id, role, content, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at DESC
    ) AS rn
  FROM chat_messages
  WHERE user_id = $1
) ranked
WHERE rn = 1
ORDER BY created_at DESC
LIMIT 20;
```

**Index:** Same `(user_id, conversation_id, created_at DESC)`.

**EXPLAIN ANALYZE pattern:**
```
Limit (cost=... rows=20)
  -> Sort (cost=... rows=N)
    -> Subquery Scan on ranked
      -> WindowAgg
        -> Index Scan using idx_chat_messages_user_conv_time
             Index Cond: (user_id = $1)
```

**Behavior:**
- PG materializes the entire user's dataset, applies ROW_NUMBER, filters rn=1, then sorts
- Always processes ALL user rows even with LIMIT 20 outside
- WindowAgg requires sort/partition pass → more memory and CPU than DISTINCT ON
- More flexible: can retrieve rn ≤ N (top-N per group) easily

**Pros:** Standard SQL, portable, trivially extended to top-N
**Cons:** Worst performance of all approaches at scale — full materialization before filtering; no early termination

**Verdict:** Avoid for this use case. Only advantage is portability to non-PostgreSQL databases.

---

### 3.3 LATERAL JOIN (Recommended)

```sql
SELECT
  m.id, m.conversation_id, m.role, m.content, m.created_at
FROM (
  -- Step 1: Get the 20 most-recently-active conversations for this user
  SELECT DISTINCT conversation_id
  FROM chat_messages
  WHERE user_id = $1
  -- Note: DISTINCT here still needs to scan all user rows unless we use recursive CTE
) convs
CROSS JOIN LATERAL (
  -- Step 2: For each conversation, fetch the single latest message
  SELECT id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
    AND conversation_id = convs.conversation_id
  ORDER BY created_at DESC
  LIMIT 1
) m
ORDER BY m.created_at DESC
LIMIT 20;
```

**Better version — separate conversation list from message fetch:**

If you have a `conversations` table or can pre-filter to top 20 conversations:

```sql
-- Optimal pattern when conversations are enumerable:
SELECT m.*
FROM (
  SELECT conversation_id, MAX(created_at) AS last_msg_at
  FROM chat_messages
  WHERE user_id = $1
  GROUP BY conversation_id
  ORDER BY last_msg_at DESC
  LIMIT 20
) top_convs
CROSS JOIN LATERAL (
  SELECT id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
    AND conversation_id = top_convs.conversation_id
  ORDER BY created_at DESC
  LIMIT 1
) m
ORDER BY m.last_msg_at DESC;
```

**Index:** The LATERAL subquery does an **Index Scan** on `(user_id, conversation_id, created_at DESC)` with both equality conditions — this is an exact prefix match, fetching exactly 1 row per conversation via an index seek.

**EXPLAIN ANALYZE pattern:**
```
Nested Loop (cost=... rows=20)
  -> HashAggregate (or Sort+GroupAggregate) for top_convs
       -> Index Scan on idx_... (user_id = $1)
  -> Index Scan on chat_messages  ← one per conversation, O(1) each
       Index Cond: (user_id=$1 AND conversation_id=convs.conversation_id)
       Limit: 1
```

**Behavior:**
- Outer query: aggregates all user rows to get conversation list (O(all user rows))
- LATERAL subquery: 20 × single-row index lookups (O(1) each × 20 = negligible)
- Total work: O(user's row count) for grouping + 20 index seeks
- PG always uses a Nested Loop for LATERAL — correct here since LATERAL side is tiny (LIMIT 1)

**Pros:**
- Best performance for this pattern when conversations > 20 (avoid fetching content for skipped rows)
- Each LATERAL call is a precise index seek — minimal I/O
- Scales excellently: cost is bounded by (1) enumerating conversations + (2) 20 point lookups
- Works correctly with LIMIT 20 on outer query — truly stops after 20 conversations

**Cons:**
- Nested Loop forced — fine here, bad if LATERAL side is expensive or returns many rows
- The outer `DISTINCT conversation_id` still scans all user rows (unless replaced with recursive CTE)
- Slightly more complex SQL

---

### 3.4 MAX() + Self-Join

```sql
SELECT cm.*
FROM chat_messages cm
INNER JOIN (
  SELECT conversation_id, MAX(created_at) AS max_ts
  FROM chat_messages
  WHERE user_id = $1
  GROUP BY conversation_id
  ORDER BY max_ts DESC
  LIMIT 20
) latest
ON cm.user_id = $1
  AND cm.conversation_id = latest.conversation_id
  AND cm.created_at = latest.max_ts;
```

**Problem:** If two messages in a conversation share the same `created_at` timestamp (rare but possible with UUID PKs and fast inserts), this returns multiple rows. Also requires two scans of the user's data.

**Index:** `(user_id, conversation_id, created_at DESC)` helps both the subquery and the join.

**Pros:** Standard SQL, widely understood
**Cons:** Duplicate risk on timestamp ties; two passes over user data; no advantage over LATERAL JOIN; generally avoided in favor of LATERAL

---

### 3.5 Recursive CTE / Loose Index Scan Emulation

PostgreSQL does NOT natively support "loose index scan" (also called "skip scan" in pre-PG18 terminology). The planner scans all matching rows instead of jumping to the next distinct key.

The recursive CTE pattern emulates it:

```sql
-- Enumerate distinct conversation_ids efficiently (loose index scan emulation)
WITH RECURSIVE conversations AS (
  -- Base: find the first (alphabetically smallest) conversation for this user
  (
    SELECT conversation_id
    FROM chat_messages
    WHERE user_id = $1
    ORDER BY conversation_id
    LIMIT 1
  )
  UNION ALL
  -- Recursive: find next conversation_id after current
  SELECT (
    SELECT conversation_id
    FROM chat_messages
    WHERE user_id = $1
      AND conversation_id > c.conversation_id
    ORDER BY conversation_id
    LIMIT 1
  )
  FROM conversations c
  WHERE c.conversation_id IS NOT NULL
)
SELECT m.*
FROM conversations c
CROSS JOIN LATERAL (
  SELECT id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
    AND conversation_id = c.conversation_id
  ORDER BY created_at DESC
  LIMIT 1
) m
WHERE c.conversation_id IS NOT NULL
ORDER BY m.created_at DESC
LIMIT 20;
```

**Index:** `(user_id, conversation_id, created_at DESC)` — each recursive step does a single index seek.

**Behavior:**
- Each CTE iteration = one index seek to find next conversation_id
- Total index seeks = number of distinct conversations (e.g., 200 seeks vs. scanning 50,000 rows)
- Each LATERAL = one index seek for latest message

**Performance comparison (from PostgreSQL wiki):**
- Without loose indexscan: 1758 ms (scanning 23M rows)
- With recursive CTE emulation: 2 ms

**When it wins:** When the ratio of (total user rows) to (distinct conversations) is very high — e.g., 50,000 messages across 100 conversations = 500x amplification. The recursive CTE pays O(conversations) index seeks instead of O(all user rows) scans.

**When it loses:** When conversations are nearly as numerous as messages (sparse data), or when conversation_id values are UUIDs with random order (many B-tree pages touched).

**Pros:** Massive speedup for dense groups (many messages per conversation); elegant index utilization
**Cons:** Complex query; harder to maintain; conversation_id ordering is lexicographic (fine for TEXT); does NOT inherently sort by recency (requires the LATERAL + ORDER BY created_at DESC wrapper); recursive CTEs are optimization fences in PostgreSQL

**Note on UUIDs as conversation_id:** If conversation_id is a random UUID (v4), the recursive CTE still works but the "next value" seeks scatter across B-tree pages, reducing cache efficiency. UUID v7 or ULID would maintain time-ordering and improve cache locality.

---

### 3.6 PostgreSQL 18 Skip Scan (Future)

PostgreSQL 18 introduces native **B-tree Skip Scan** in the query planner. This is the native implementation of the loose index scan concept.

**What it does:** When a composite index has leading columns not in WHERE clause equality conditions, PG 18 can "skip" through distinct leading values automatically, performing multiple targeted sub-scans.

**Current limitations for this use case:**
- Requires equality conditions on later indexed columns — our query has no such condition after `conversation_id`
- Most beneficial for **low-cardinality leading columns** (3–5 distinct values); if `user_id` has millions of distinct users, skip scan on `conversation_id` prefix helps but isn't the primary optimization
- Benchmark shows ~75% improvement (48ms → 12ms) for a 1M row table — not the 100–8500x gains from LATERAL JOIN
- TimescaleDB's custom SkipScan node shows 26x–8500x gains for pure DISTINCT queries; PG 18's native implementation is more conservative

**Verdict:** Skip Scan in PG 18 narrows the gap but doesn't replace the LATERAL JOIN pattern for this workload in PG ≤ 18. Monitor PG 19+ for further planner improvements.

---

## 4. Performance at Scale

Assumptions: user has 200 conversations, messages per conversation avg 100 (20,000 total per user). Index: `(user_id, conversation_id, created_at DESC)`.

| Scale (total rows) | DISTINCT ON | ROW_NUMBER | LATERAL JOIN | Recursive CTE |
|---|---|---|---|---|
| 1M rows | ~2ms | ~5ms | ~1ms | ~1ms |
| 10M rows | ~3ms | ~8ms | ~1ms | ~1ms |
| 100M rows | ~5ms | ~15ms | ~2ms | ~2ms |
| 1B rows | ~10ms | ~40ms | ~3ms | ~3ms |

*Estimates assuming optimal index is present. "Per-user" dataset size dominates, not total table size.*

**Key insight:** With `WHERE user_id = $1` and the composite index, ALL approaches narrow to the per-user dataset first. Total table size barely matters — what matters is the per-user row count. At 20,000 rows per user with an index, even DISTINCT ON is fast. The performance gap widens when a user has 500,000+ messages.

**Without the right index:** All approaches degrade to Seq Scan of the full table — unacceptable at 100M+ rows.

---

## 5. Final Recommendation

### For this specific workload: LATERAL JOIN + Composite Index

```sql
-- Index (create once)
CREATE INDEX idx_chat_messages_user_conv_time
  ON chat_messages (user_id, conversation_id, created_at DESC)
  INCLUDE (id, role, content);

-- Query
SELECT
  m.id,
  m.conversation_id,
  m.role,
  m.content,
  m.created_at
FROM (
  SELECT conversation_id, MAX(created_at) AS last_msg_at
  FROM chat_messages
  WHERE user_id = $1
  GROUP BY conversation_id
  ORDER BY last_msg_at DESC
  LIMIT 20
) top_convs
CROSS JOIN LATERAL (
  SELECT id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
    AND conversation_id = top_convs.conversation_id
  ORDER BY created_at DESC
  LIMIT 1
) m
ORDER BY m.created_at DESC;
```

**Why:**
1. Outer GROUP BY + LIMIT 20: scans all user rows once, aggregates, stops at 20 — O(user rows)
2. LATERAL: 20 single-row index seeks using `(user_id, conversation_id, created_at DESC)` — O(20)
3. INCLUDE columns: Index-Only Scan possible — no heap fetch for the 20 rows
4. Correct final ordering: `ORDER BY m.created_at DESC` sorts the 20 already-fetched rows

### When to use DISTINCT ON instead

If the per-user dataset is guaranteed small (< 10,000 messages) and the query is simpler to maintain:

```sql
SELECT *
FROM (
  SELECT DISTINCT ON (conversation_id)
    id, conversation_id, role, content, created_at
  FROM chat_messages
  WHERE user_id = $1
  ORDER BY conversation_id, created_at DESC
) t
ORDER BY created_at DESC
LIMIT 20;
```

### When to use Recursive CTE

When a user has extremely dense conversations (e.g., 1,000+ messages per conversation) and the ratio of messages-to-conversations is very high. The recursive CTE's O(conversations) seeks beats O(all messages) scan.

### Index creation priority

1. `(user_id, conversation_id, created_at DESC) INCLUDE (id, role, content)` — primary
2. Add `WHERE role IS NOT NULL` as a partial index if you frequently filter by role
3. Drop any index that only covers `(user_id)` alone — it's subsumed by the composite

### Do NOT use

- `ROW_NUMBER()` for this pattern — no early termination, full materialization
- `MAX() + self-join` — duplicate risk, two passes, no advantage
- Recursive CTE unless per-user density is very high and profiling confirms the gain

---

## 6. Unresolved Questions

1. **conversation_id type:** Is it a random UUID, sequential UUID (v7/ULID), or TEXT slug? Random UUIDs degrade B-tree cache efficiency for the recursive CTE approach; TEXT slugs are fine.
2. **Read/write ratio:** If writes are very frequent, the INCLUDE columns in the index add write overhead. At high write rates, consider whether index-only scan benefit justifies the cost.
3. **PostgreSQL version in production:** PG 18 Skip Scan may change the calculus. What version is deployed?
4. **Content column size:** If `content` is large (multi-KB), including it in INCLUDE may bloat the index significantly. Consider excluding it and accepting the heap fetch.
5. **Conversation deletion/archiving:** If conversations are soft-deleted, a partial index `WHERE deleted_at IS NULL` could be valuable — but only if the selectivity is high.
6. **Multi-user aggregation:** The current analysis is for single-user queries. Admin dashboards querying across users would need different strategy.

---

## 7. Sources

- [PostgreSQL Wiki: Loose Index Scan](https://wiki.postgresql.org/wiki/Loose_indexscan)
- [PostgreSQL Official Docs: Index-Only Scans and Covering Indexes](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)
- [PostgreSQL Official Docs: Table Expressions / LATERAL](https://www.postgresql.org/docs/current/queries-table-expressions.html)
- [pgedge: PostgreSQL 18 Skip Scan](https://www.pgedge.com/blog/postgres-18-skip-scan-breaking-free-from-the-left-most-index-limitation)
- [Timescale/TigerData: SkipScan — 8000x Faster DISTINCT Queries](https://www.tigerdata.com/blog/how-we-made-distinct-queries-up-to-8000x-faster-on-postgresql)
- [Cybertec: Understanding LATERAL Joins in PostgreSQL](https://www.cybertec-postgresql.com/en/understanding-lateral-joins-in-postgresql/)
- [Cybertec: Combined Indexes vs Separate Indexes](https://www.cybertec-postgresql.com/en/combined-indexes-vs-separate-indexes-in-postgresql/)
- [depesz: Using Recursive Queries to Get Distinct Elements](https://www.depesz.com/2021/09/27/using-recursive-queries-to-get-distinct-elements-from-table/)
- [DEV.to (YugaByte): Loose Index Scan aka Skip Scan in PostgreSQL](https://dev.to/yugabyte/loose-index-scan-aka-skip-scan-in-postgresql-1jfo)
- [Percona: PostgreSQL 15 Working with SELECT DISTINCT](https://www.percona.com/blog/introducing-postgresql-15-working-with-distinct/)
- [Heap.io: PostgreSQL's Powerful New Join Type: LATERAL](https://www.heap.io/blog/postgresqls-powerful-new-join-type-lateral)
- [DBA StackExchange: How to Make DISTINCT ON Faster in PostgreSQL](https://dba.stackexchange.com/questions/177162/how-to-make-distinct-on-faster-in-postgresql)
- [Stormatics: Optimizing PostgreSQL with Composite and Partial Indexes](https://stormatics.tech/blogs/optimizing-postgresql-with-composite-and-partial-indexes)
- [malisper.me: The Missing Postgres Scan — The Loose Index Scan](https://malisper.me/the-missing-postgres-scan-the-loose-index-scan/)
