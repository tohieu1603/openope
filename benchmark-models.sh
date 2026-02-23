#!/bin/bash
# ============================================================
# OpenClaw Model Benchmark
# 20 real-world workflows: Basic → Intermediate → Advanced
# Based on actual OpenClaw tools: exec, read/write/edit, web_search,
# web_fetch, browser, message, cron, sessions_spawn, memory, image
# ============================================================

set -euo pipefail

RESULTS_DIR="./benchmark-results"
mkdir -p "$RESULTS_DIR"

echo "============================================"
echo " OpenClaw Model Benchmark - $(date '+%Y-%m-%d %H:%M')"
echo "============================================"

python3 << 'PYEOF'
import json, time, os, urllib.request

GATEWAY_URL = "http://localhost:3000"
_home = os.path.expanduser("~")
_cfg = json.load(open(os.path.join(_home, ".openclaw/openclaw.json")))
GW_TOKEN = _cfg.get("gateway", {}).get("auth", {}).get("token", "")
RESULTS_DIR = "./benchmark-results"
TIMEOUT = 120
MAX_TOKENS = 2048

MODELS = [
    "deepseek-chat",
    "byteplus/kimi-k2.5",
    "byteplus/kimi-k2-thinking",
    "byteplus/gpt-oss-120b",
    "byteplus/glm-4.7",
    "byteplus/bytedance-seed-code",
]

# ============================================================
# 20 Real OpenClaw Workflows — Basic → Intermediate → Advanced
#
# BASIC (1-7): Daily chat, Q&A, Vietnamese, simple tasks
#   - User chats via Telegram/Zalo in Vietnamese
#   - Simple questions, translations, formatting
#
# INTERMEDIATE (8-14): Coding, content, data tasks
#   - Write/debug code (coding-agent workflow)
#   - Summarize, extract data, analyze errors
#
# ADVANCED (15-20): Multi-tool orchestration, automation
#   - Tool call generation, cron scheduling
#   - Complex coding, multi-step planning
# ============================================================

QUESTIONS = [
    # ======== BASIC (1-7): Daily user chat ========

    # User chats via Zalo — basic Vietnamese greeting
    (1, "Basic",
     "Chào bạn! Mình là Minh, mình mới dùng Operis. Bạn có thể giới thiệu bạn là ai và bạn có thể giúp mình những gì không?",
     "Operis"),

    # User asks simple tech question via Telegram
    (2, "Basic",
     "REST API và GraphQL khác nhau chỗ nào? Trả lời ngắn gọn 3 điểm chính.",
     "GraphQL"),

    # User asks to explain code (read tool context)
    (3, "Basic",
     "Giải thích đoạn code này làm gì:\n```javascript\nconst pipe = (...fns) => x => fns.reduce((v, f) => f(v), x);\n```",
     "reduce"),

    # User asks to translate (message tool — cross-channel)
    (4, "Basic",
     "Dịch sang tiếng Anh chuyên nghiệp giúp mình:\n'Hệ thống sẽ bảo trì từ 22h ngày 15/02 đến 6h ngày 16/02. Trong thời gian này dịch vụ tạm ngưng. Xin lỗi vì sự bất tiện.'",
     "maintenance"),

    # User asks to format data (write tool context)
    (5, "Basic",
     "Format dữ liệu này thành markdown table:\nMinh - Backend Dev - Platform team\nLan - Frontend Dev - Product team\nĐức - DevOps - Infrastructure team",
     "| Minh"),

    # User asks about system capabilities
    (6, "Basic",
     "Mình muốn biết bạn có thể giúp mình những gì? Liệt kê 5 việc chính bạn làm được.",
     "code"),

    # User asks simple math/logic
    (7, "Basic",
     "Server mình nhận 500 request/giây, mỗi request xử lý 100ms. Cần tối thiểu bao nhiêu thread để xử lý hết? Giải thích ngắn gọn.",
     "50"),

    # ======== INTERMEDIATE (8-14): Coding & content ========

    # Coding: write a function (exec/write tool context)
    (8, "Mid",
     "Viết function TypeScript tên `debounce` nhận callback và delay(ms), trả về debounced function. Yêu cầu: generic typing, giữ this context, có JSDoc. Chỉ output code.",
     "debounce"),

    # Coding: debug (read/edit tool context)
    (9, "Mid",
     "Tìm bug trong code Python này và sửa:\n```python\ndef merge_sorted(a, b):\n    result = []\n    i = j = 0\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            result.append(a[i])\n            i += 1\n        else:\n            result.append(b[j])\n            j += 1\n    return result\n```\nGiải thích bug và cho code đã sửa.",
     "remaining"),

    # Content: write welcome message (message tool)
    (10, "Mid",
     "Viết welcome message cho Telegram bot của Operis. Yêu cầu:\n- Chào user thân thiện\n- Giới thiệu 3 tính năng: hỗ trợ coding, tự động hóa, đa ngôn ngữ\n- Dùng emoji phù hợp\n- Kết thúc bằng call-to-action\n- Tối đa 120 từ, giọng văn chuyên nghiệp nhưng gần gũi",
     "Operis"),

    # Data extraction (web_fetch context — extract from text)
    (11, "Mid",
     "Trích xuất dữ liệu từ text sau thành JSON {name, role, company, action, deadline}:\n\n'Xin chào team, tôi là Nguyễn Văn A từ công ty VNG. Với vai trò Lead DevOps, tôi cần mọi người hoàn thành việc migrate CI/CD pipeline sang GitHub Actions trước ngày 15/03/2026.'",
     "Nguyen"),

    # Error analysis (exec/read context — analyze logs)
    (12, "Mid",
     "Phân tích lỗi API này và đề xuất 3 cách fix cụ thể:\n```json\n{\"status\": 429, \"error\": \"Too Many Requests\", \"headers\": {\"retry-after\": \"30\", \"x-ratelimit-limit\": \"100\", \"x-ratelimit-remaining\": \"0\"}, \"body\": {\"message\": \"Rate limit exceeded. Implement exponential backoff.\"}}\n```",
     "backoff"),

    # Summarize (web_fetch/read context)
    (13, "Mid",
     "Tóm tắt đúng 3 bullet points (mỗi point tối đa 20 từ):\n\nKubernetes là nền tảng container orchestration mã nguồn mở tự động hóa triển khai, mở rộng và quản lý ứng dụng container. Nó nhóm container thành pod để dễ quản lý. Kubernetes cung cấp self-healing - tự restart container lỗi, thay thế container khi node chết. Nó hỗ trợ horizontal scaling tự động hoặc thủ công dựa trên CPU. Service discovery và load balancing tích hợp sẵn qua DNS hoặc IP.",
     "pod"),

    # Vietnamese technical explanation
    (14, "Mid",
     "Giải thích 'Infrastructure as Code' cho developer Việt Nam mới bắt đầu. Bao gồm:\n1. Định nghĩa đơn giản\n2. Tại sao cần dùng\n3. Ví dụ cụ thể với Docker Compose\n4. So sánh trước/sau khi dùng IaC\nTối đa 200 từ.",
     "Docker"),

    # ======== ADVANCED (15-20): Multi-tool & automation ========

    # Cron scheduling (cron tool — real workflow)
    (15, "Adv",
     "Mình có 3 cron job:\n- Job A: chạy mỗi 15 phút (*/15 * * * *)\n- Job B: chạy đầu mỗi giờ (0 * * * *)\n- Job C: chạy lúc 00:00 hàng ngày (0 0 * * *)\n\nTính:\n(a) Tổng số lần chạy trong 24h cho mỗi job\n(b) Tổng combined executions\n(c) Thời điểm nào Job A và Job B chạy đồng thời?\nTrình bày chi tiết từng bước.",
     "96"),

    # Tool call generation (sessions_spawn/exec context)
    (16, "Adv",
     "Bạn là AI assistant có các tool sau:\n- exec(command: string) — chạy shell command\n- web_fetch(url: string) — fetch nội dung URL\n- message(channel: string, text: string) — gửi tin nhắn\n- cron(action: string, schedule: string, command: string) — tạo cron job\n\nUser yêu cầu: 'Kiểm tra API https://api.example.com/health mỗi 5 phút. Nếu down thì gửi tin nhắn vào kênh #alerts.'\n\nGenerate tool calls dạng JSON array. Chỉ output JSON, không giải thích.",
     "cron"),

    # Complex coding (coding-agent advanced workflow)
    (17, "Adv",
     "Implement class TypeScript `TokenBucketRateLimiter`:\n- Constructor: maxTokens, refillRate (tokens/sec)\n- Method `tryConsume(n: number): boolean` — true nếu đủ token\n- Method `getStatus(): {available, max, nextRefillMs}`\n- Auto-refill dựa trên thời gian thực\n- Có usage example\nOutput production-ready code.",
     "tryConsume"),

    # Multi-step deployment (exec/read/write orchestration)
    (18, "Adv",
     "Thiết kế deployment plan zero-downtime cho Node.js app + PostgreSQL + Redis. Yêu cầu:\n- Blue-green deployment\n- Database migration an toàn\n- Rollback strategy\n- Health check\nĐưa ra đúng 7 bước, mỗi bước gồm: hành động, rủi ro, cách rollback.",
     "migration"),

    # Strict instruction following (system prompt compliance)
    (19, "Adv",
     "Tuân thủ CHÍNH XÁC các quy tắc sau:\n1. Bắt đầu response bằng 'REPORT:'\n2. Viết markdown table 3 hàng, cột: Model, Speed, Quality, Cost\n3. Hàng 1: GPT-4o, Fast, High, $$$\n4. Hàng 2: Claude, Medium, Very High, $$\n5. Hàng 3: DeepSeek, Fast, Good, $\n6. Sau table viết đúng 1 câu tổng kết\n7. Kết thúc bằng 'END_REPORT'\n8. KHÔNG thêm bất kỳ text nào trước REPORT: hoặc sau END_REPORT",
     "REPORT:"),

    # Vietnamese complex plan (multi-tool orchestration context)
    (20, "Adv",
     "Viết technical plan bằng tiếng Việt để chuyển hệ thống từ monolith sang microservices. Yêu cầu:\n1. Chia 5 giai đoạn\n2. Mỗi giai đoạn có: mục tiêu, công việc chính, rủi ro, thời gian ước tính\n3. Format markdown table\n4. Bao gồm services: Auth, Payment, Notification, Order\n5. Tổng thời gian không quá 6 tháng\nChỉ output markdown table, không giải thích thêm.",
     "microservice"),
]

def call_model(model, question, q_id):
    """Call gateway /v1/chat/completions API."""
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": question}],
        "stream": False,
        "max_tokens": MAX_TOKENS,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{GATEWAY_URL}/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GW_TOKEN}",
        },
        method="POST",
    )

    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            elapsed = round(time.time() - start, 2)
            content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
            tokens = body.get("usage", {}).get("total_tokens", 0)
            return {
                "status": "OK",
                "content": content,
                "tokens": tokens,
                "time": elapsed,
                "model_used": body.get("model", model),
            }
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        return {
            "status": f"FAIL: {str(e)[:80]}",
            "content": "",
            "tokens": 0,
            "time": elapsed,
            "model_used": model,
        }

# ---- Run ----
all_results = []

for model in MODELS:
    print(f"\n{'━' * 60}")
    print(f"  Model: {model}")
    print(f"{'━' * 60}")

    for q_id, category, question, keyword in QUESTIONS:
        result = call_model(model, question, q_id)
        has_kw = keyword.lower() in result["content"].lower() if result["status"] == "OK" else False

        icon = "✓" if has_kw else ("△" if result["status"] == "OK" else "✗")
        print(f"  {icon} Q{q_id:02d} [{category:5s}] {result['time']:6.1f}s | {result['tokens']:5d} tok | kw:{('Y' if has_kw else 'N')}")

        all_results.append({
            "model": model, "q_id": q_id, "category": category,
            "question": question[:80], "keyword": keyword,
            "status": result["status"], "has_keyword": has_kw,
            "time": result["time"], "tokens": result["tokens"],
            "content_preview": result["content"][:300],
        })

        safe_model = model.replace("/", "_")
        with open(f"{RESULTS_DIR}/{safe_model}_q{q_id:02d}.json", "w") as f:
            json.dump({"model": model, "q_id": q_id, "category": category,
                        "result": result}, f, indent=2, ensure_ascii=False)

        time.sleep(1)

# ---- Save raw ----
with open(f"{RESULTS_DIR}/all-results.json", "w") as f:
    json.dump(all_results, f, indent=2, ensure_ascii=False)

# ---- Generate report ----
models = MODELS
lines = []
lines.append("# OpenClaw Model Benchmark Report\n")
lines.append(f"**Date:** {time.strftime('%Y-%m-%d %H:%M')}")
lines.append(f"**Workflows:** {len(QUESTIONS)} | **Models:** {len(models)}")
lines.append(f"**Gateway:** localhost:3000 (OpenClaw)")
lines.append(f"**Max tokens:** {MAX_TOKENS}")
lines.append(f"**Levels:** Basic (Q1-7) | Intermediate (Q8-14) | Advanced (Q15-20)\n")

# Overall ranking
lines.append("## Overall Ranking\n")
lines.append("| # | Model | OK | Hit | Score | Avg Time | Tokens |")
lines.append("|---|-------|----|-----|-------|----------|--------|")

model_stats = {}
for m in models:
    rows = [r for r in all_results if r["model"] == m]
    ok = sum(1 for r in rows if r["status"] == "OK")
    kw = sum(1 for r in rows if r["has_keyword"])
    t = sum(r["time"] for r in rows)
    tok = sum(r["tokens"] for r in rows)
    avg = t / len(rows) if rows else 0
    score = round((kw / len(rows)) * 100, 1) if rows else 0
    model_stats[m] = {"ok": ok, "kw": kw, "score": score, "avg_t": round(avg, 1), "tok": tok}

medals = ["🥇", "🥈", "🥉", "4.", "5.", "6."]
for rank, m in enumerate(sorted(models, key=lambda x: -model_stats[x]["score"]), 1):
    s = model_stats[m]
    short = m.split("/")[-1]
    lines.append(f"| {medals[rank-1]} | **{short}** | {s['ok']}/20 | {s['kw']}/20 | **{s['score']}%** | {s['avg_t']}s | {s['tok']:,} |")

# Per-question matrix
lines.append("\n## Per-Workflow Matrix\n")
short_names = [m.split("/")[-1] for m in models]
lines.append("| Q# | Level | " + " | ".join(short_names) + " |")
lines.append("|:---:|:-----:" + "|:---:" * len(models) + "|")

for q_id, cat, _, _ in QUESTIONS:
    row = f"| {q_id} | {cat} |"
    for m in models:
        r = next((x for x in all_results if x["model"] == m and x["q_id"] == q_id), None)
        if not r:
            row += " - |"
        elif r["status"] != "OK":
            row += " ✗ |"
        elif r["has_keyword"]:
            row += f" ✓ {r['time']}s |"
        else:
            row += f" △ {r['time']}s |"
    lines.append(row)

lines.append("\n**Legend:** ✓ keyword found | △ answered, keyword missing | ✗ API error\n")

# Speed
lines.append("## Speed Comparison\n")
lines.append("| Model | Min | Max | Avg | Median |")
lines.append("|-------|-----|-----|-----|--------|")
for m in models:
    ok_rows = [r for r in all_results if r["model"] == m and r["status"] == "OK"]
    if ok_rows:
        t = sorted([r["time"] for r in ok_rows])
        short = m.split("/")[-1]
        lines.append(f"| {short} | {min(t)}s | {max(t)}s | {round(sum(t)/len(t),1)}s | {t[len(t)//2]}s |")

# Level breakdown
lines.append("\n## Workflow Level Breakdown\n")
lines.append("| Model | Basic (1-7) | Mid (8-14) | Adv (15-20) | Total |")
lines.append("|-------|:-----------:|:----------:|:-----------:|:-----:|")
for m in models:
    short = m.split("/")[-1]
    parts = []
    total_kw = 0
    for cat in ["Basic", "Mid", "Adv"]:
        cat_rows = [r for r in all_results if r["model"] == m and r["category"] == cat]
        kw = sum(1 for r in cat_rows if r["has_keyword"])
        total_kw += kw
        parts.append(f"{kw}/{len(cat_rows)}")
    lines.append(f"| {short} | {parts[0]} | {parts[1]} | {parts[2]} | **{total_kw}/20** |")

lines.append("")

report = "\n".join(lines)
with open(f"{RESULTS_DIR}/benchmark-report.md", "w") as f:
    f.write(report)

print(f"\n{'=' * 60}")
print(f" BENCHMARK COMPLETE")
print(f"{'=' * 60}")
print(f" Report: {RESULTS_DIR}/benchmark-report.md")
print(f" Raw:    {RESULTS_DIR}/all-results.json")
print(f"{'=' * 60}")

print(f"\n RANKING:")
for rank, m in enumerate(sorted(models, key=lambda x: -model_stats[x]["score"]), 1):
    s = model_stats[m]
    short = m.split("/")[-1]
    bar = "█" * int(s["score"] / 5) + "░" * (20 - int(s["score"] / 5))
    print(f"  {rank}. {short:25s} {bar} {s['score']}% ({s['kw']}/20)")

PYEOF

echo ""
echo "Done! View: cat ./benchmark-results/benchmark-report.md"
