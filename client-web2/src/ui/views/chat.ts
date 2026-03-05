import katex from "katex";
import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import type { Conversation } from "../chat-api";
import { t } from "../i18n";
import { icons, type IconName } from "../icons";
import { formatSessionDisplay } from "../session-actions";

// Configure marked for safe inline rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub flavored markdown
});

// Detect HTML error pages (Cloudflare, nginx, etc.) in content
function isHtmlErrorContent(text: string): boolean {
  return (
    /<!doctype|<html|<head>|cloudflare|cf-error|cf-wrapper/i.test(text) &&
    /<\/?(?:div|section|span|script|style|link|meta)\b/i.test(text)
  );
}

function renderMarkdown(content: string): ReturnType<typeof unsafeHTML> {
  // Guard: detect HTML error pages leaked into chat content
  if (isHtmlErrorContent(content)) {
    // Extract error code if available (e.g. "Error 502", "Error 1033")
    const codeMatch = content.match(/Error\s*(?:code\s*)?(\d{3,4})/i);
    const code = codeMatch ? ` (${codeMatch[1]})` : "";
    return unsafeHTML(
      `<p style="color:var(--danger,#dc2626)">Gateway không khả dụng${code}. Vui lòng thử lại sau.</p>`,
    );
  }

  // 1. Extract math expressions before marked processing
  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  // Replace $$ ... $$ (block math)
  let processed = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const idx = mathBlocks.length;
    mathBlocks.push(expr.trim());
    return `\nMATHBLOCK${idx}ENDMATHBLOCK\n`;
  });

  // Replace $ ... $ (inline math) — skip $$ and escaped \$
  processed = processed.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_, expr) => {
    const idx = mathInlines.length;
    mathInlines.push(expr.trim());
    return `MATHINLINE${idx}ENDMATHINLINE`;
  });

  // 2. Run marked
  let htmlContent = marked.parse(processed, { async: false }) as string;

  // 3. Replace placeholders with KaTeX rendered HTML
  htmlContent = htmlContent.replace(/MATHBLOCK(\d+)ENDMATHBLOCK/g, (_, idx) => {
    try {
      return katex.renderToString(mathBlocks[parseInt(idx)], {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `$$${mathBlocks[parseInt(idx)]}$$`;
    }
  });

  htmlContent = htmlContent.replace(/MATHINLINE(\d+)ENDMATHINLINE/g, (_, idx) => {
    try {
      return katex.renderToString(mathInlines[parseInt(idx)], {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `$${mathInlines[parseInt(idx)]}$`;
    }
  });

  // 4. Wrap <table> in scrollable container
  htmlContent = htmlContent.replace(/<table/g, '<div class="gc-table-wrap"><table');
  htmlContent = htmlContent.replace(/<\/table>/g, "</table></div>");

  // 5. Wrap <pre> blocks with copy button
  const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  htmlContent = htmlContent.replace(
    /<pre>/g,
    `<div class="gc-code-wrap"><button class="gc-code-copy" title="Sao chép" onclick="var t=this.parentElement.querySelector('pre').textContent;navigator.clipboard.writeText(t).then(()=>{this.innerHTML='${checkSvg.replace(/'/g, "\\'")}';this.classList.add('gc-code-copy--done');setTimeout(()=>{this.innerHTML='${copySvg.replace(/'/g, "\\'")}';this.classList.remove('gc-code-copy--done')},1500)})">${copySvg}</button><pre>`,
  );
  htmlContent = htmlContent.replace(/<\/pre>/g, "</pre></div>");

  return unsafeHTML(htmlContent);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | Date;
  /** Base64 image previews attached to this message */
  images?: Array<{ preview: string }>;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  phase: "start" | "update" | "result";
  isError?: boolean;
  /** Short action detail e.g. "navigate · google.com" */
  detail?: string;
  /** Tool output text (result phase) */
  output?: string;
}

export interface QueueItem {
  id: string;
  text: string;
  createdAt: number;
  images?: Array<{ preview: string }>;
}

export interface PendingImage {
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for display
}

export interface ChatProps {
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  loading?: boolean;
  isLoggedIn: boolean;
  username?: string;
  botName?: string;
  streamingText?: string;
  toolCalls?: ToolCallInfo[];
  pendingImages?: PendingImage[];
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onLoginClick: () => void;
  onImageSelect: (files: FileList) => void;
  onImageRemove: (index: number) => void;
  onScroll?: (e: Event) => void;
  gatewayReady?: boolean;
  // Sidebar props
  conversations?: Conversation[];
  conversationsLoading?: boolean;
  currentConversationId?: string | null;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRefreshChat?: () => void;
  compactionActive?: boolean;
  queue?: QueueItem[];
  onQueueRemove?: (id: string) => void;
  sessionKey?: string;
  /** Available gateway sessions for the session selector dropdown */
  gatewaySessions?: Array<{
    key: string;
    displayName?: string;
    derivedTitle?: string;
    lastMessagePreview?: string;
    model?: string;
    updatedAt?: number | null;
    kind?: string;
  }>;
  onSessionChange?: (key: string) => void;
}

function formatTime(timestamp?: string | Date): string {
  if (!timestamp) return "";
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const now = new Date();
  const time = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Check if same day
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return time;

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) return `Hôm qua ${time}`;

  // Check if same year
  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")} ${time}`;
  }

  // Different year - show full date
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()} ${time}`;
}

const suggestions = [
  // {
  //   icon: icons.image,
  //   label: t("chatSuggestionImage"),
  //   prompt: "Tạo hình ảnh về",
  // },
  {
    icon: icons.pencil,
    label: t("chatSuggestionWrite"),
    prompt: "Giúp tôi viết",
  },
  {
    icon: icons.graduationCap,
    label: t("chatSuggestionLearn"),
    prompt: "Dạy tôi về",
  },
  {
    icon: icons.coffee,
    label: t("chatSuggestionDay"),
    prompt: "Giúp tôi lên kế hoạch",
  },
];

// ── Tool display resolution (matching original tool-display.ts) ──

const TOOL_DISPLAY_MAP: Record<string, { icon: IconName; title: string; detailKeys?: string[] }> = {
  bash: { icon: "wrench", title: "Bash", detailKeys: ["command"] },
  process: { icon: "wrench", title: "Process", detailKeys: ["sessionId"] },
  read: { icon: "fileText", title: "Read", detailKeys: ["path"] },
  write: { icon: "penLine", title: "Write", detailKeys: ["path"] },
  edit: { icon: "penLine", title: "Edit", detailKeys: ["path"] },
  attach: { icon: "paperclip", title: "Attach", detailKeys: ["path", "url", "fileName"] },
  browser: { icon: "globe", title: "Browser" },
  canvas: { icon: "image", title: "Canvas" },
  nodes: { icon: "smartphone", title: "Nodes" },
  cron: { icon: "loader", title: "Cron" },
  gateway: { icon: "plug", title: "Gateway" },
  discord: { icon: "messageSquare", title: "Discord" },
  slack: { icon: "messageSquare", title: "Slack" },
};

function resolveToolIcon(name: string): IconName {
  return TOOL_DISPLAY_MAP[name.toLowerCase()]?.icon ?? "puzzle";
}

function resolveToolLabel(name: string): string {
  const spec = TOOL_DISPLAY_MAP[name.toLowerCase()];
  if (spec) return spec.title;
  // Default: capitalize and replace underscores
  const cleaned = name.replace(/_/g, " ").trim();
  if (!cleaned) return "Tool";
  return cleaned
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const PREVIEW_MAX_LINES = 2;
const PREVIEW_MAX_CHARS = 100;

function getTruncatedPreview(text: string): string {
  const lines = text.split("\n").slice(0, PREVIEW_MAX_LINES);
  let preview = lines.join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) {
    preview = preview.slice(0, PREVIEW_MAX_CHARS) + "…";
  } else if (text.split("\n").length > PREVIEW_MAX_LINES) {
    preview += "…";
  }
  return preview;
}

function shortenHomePath(input: string): string {
  if (!input) return input;
  return input.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
}

export function renderChat(props: ChatProps) {
  const {
    messages,
    draft,
    sending,
    loading = false,
    isLoggedIn,
    username,
    botName = "Operis",
    streamingText = "",
    toolCalls = [],
    pendingImages = [],
    onDraftChange,
    onSend,
    onStop,
    onLoginClick,
    onImageSelect,
    onImageRemove,
    onScroll,
    gatewayReady = true,
    conversations = [],
    conversationsLoading = false,
    currentConversationId = null,
    sidebarCollapsed = false,
    onToggleSidebar,
    onNewConversation,
    onRefreshChat,
    compactionActive = false,
    queue = [],
    onQueueRemove,
    sessionKey = "main",
    gatewaySessions = [],
    onSessionChange,
  } = props;
  const isEmpty = messages.length === 0;
  const displayName = username || "Bạn";

  /** Scroll detection: show scroll-to-bottom button when user scrolls up */
  const handleScrollCheck = (e: Event) => {
    onScroll?.(e);
    const el = e.target as HTMLElement;
    const btn = el.parentElement?.querySelector(".gc-scroll-bottom") as HTMLElement;
    if (!btn) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    btn.classList.toggle("gc-scroll-bottom--visible", distFromBottom > 200);
  };

  const handleScrollToBottom = (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    const messagesEl = btn.parentElement?.querySelector(".gc-messages") as HTMLElement;
    if (messagesEl) {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!gatewayReady) return;
      if (!isLoggedIn) {
        onLoginClick();
      } else if (draft.trim()) {
        // Reset textarea height after sending
        const textarea = e.target as HTMLTextAreaElement;
        setTimeout(() => {
          textarea.style.height = "auto";
        }, 0);
        onSend();
      }
    }
  };

  const handleSendClick = () => {
    if (!gatewayReady) return;
    if (!isLoggedIn) {
      onLoginClick();
    } else {
      onSend();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of imageFiles) dt.items.add(f);
      onImageSelect(dt.files);
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    onDraftChange(prompt + " ");
  };

  return html`
    <style>
      /* Full-width Chat Container */
      .gc-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        background: var(--bg);
        overflow: hidden;
      }
      .gc-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      /* Empty State - Gemini Style */
      .gc-welcome {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        animation: gc-fade-up 0.5s ease-out;
      }
      @keyframes gc-fade-up {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
      }

      .gc-greeting {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .gc-greeting-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gc-greeting-icon svg {
        width: 28px;
        height: 28px;
        stroke: none;
        fill: url(#gc-gradient);
      }
      .gc-greeting-text {
        font-size: 20px;
        font-weight: 500;
        color: var(--text);
      }

      .gc-subtitle {
        font-size: 32px;
        font-weight: 400;
        color: var(--text-strong);
        margin-bottom: 32px;
        letter-spacing: -0.02em;
        text-align: center;
      }

      /* Input Box */
      .gc-input-wrap {
        width: 100%;
        max-width: 680px;
        max-height: 250px;
        margin-bottom: 24px;
        padding: 0 16px;
        box-sizing: border-box;
      }

      .gc-input-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 250px;
        padding: 16px 16px 12px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-sizing: border-box;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
      }
      .gc-input-box:focus-within {
        border-color: var(--border-strong);
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
      }

      .gc-input {
        width: 100%;
        min-height: 24px;
        max-height: 178px;
        padding: 0;
        padding-right: 4px;
        font-size: 16px;
        font-family: inherit;
        background: transparent;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        color: var(--text);
        line-height: 1.5;
        resize: none;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
      }
      .gc-input::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      .gc-input::-webkit-scrollbar-track {
        background: transparent;
      }
      .gc-input::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: var(--radius-full);
      }
      .gc-input::-webkit-scrollbar-thumb:hover {
        background: var(--border-strong);
      }
      .gc-input:focus {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
      .gc-input::placeholder {
        color: var(--muted);
      }

      .gc-input-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .gc-actions-left {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .gc-actions-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .gc-action-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 50%;
        color: var(--muted);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gc-action-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
      }
      .gc-action-btn svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }

      /* Image preview strip */
      .gc-image-previews {
        display: flex;
        gap: 8px;
        padding: 0 4px;
        overflow-x: auto;
      }
      .gc-image-previews::-webkit-scrollbar { height: 4px; }
      .gc-image-previews::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      .gc-image-preview {
        position: relative;
        width: 64px;
        height: 64px;
        border-radius: 12px;
        overflow: hidden;
        flex-shrink: 0;
        border: 1px solid var(--border);
      }
      .gc-image-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .gc-image-preview-remove {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.6);
        border: none;
        border-radius: 50%;
        color: white;
        cursor: pointer;
        padding: 0;
        font-size: 14px;
        line-height: 1;
      }
      .gc-image-preview-remove:hover {
        background: rgba(0,0,0,0.8);
      }
      .gc-image-file-input {
        display: none;
      }

      /* Images in sent message bubbles */
      .gc-bubble-images {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .gc-bubble-images img {
        max-width: 200px;
        max-height: 200px;
        border-radius: 10px;
        object-fit: cover;
        cursor: pointer;
      }
      .gc-bubble-images img:hover {
        opacity: 0.9;
      }

      .gc-send-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent);
        border: none;
        border-radius: 50%;
        color: var(--accent-foreground);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gc-send-btn:hover:not(:disabled) {
        background: var(--accent-hover);
      }
      .gc-send-btn:disabled {
        background: var(--secondary);
        color: var(--muted);
        cursor: not-allowed;
      }
      .gc-send-btn svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      .gc-stop-btn {
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 14px;
        background: var(--destructive, #dc2626);
        border: none;
        border-radius: 18px;
        color: white;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.15s ease;
        animation: gc-stop-pop 0.2s ease-out;
      }
      .gc-stop-btn:hover {
        background: var(--destructive-hover, #b91c1c);
        transform: scale(1.05);
      }
      @keyframes gc-stop-pop {
        from { transform: scale(0.8); opacity: 0.5; }
        to { transform: scale(1); opacity: 1; }
      }

      .gc-queue-btn {
        height: 36px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 14px;
        background: var(--accent);
        border: none;
        border-radius: 18px;
        color: var(--accent-foreground);
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.15s ease;
      }
      .gc-queue-btn:hover:not(:disabled) {
        background: var(--accent-hover);
      }
      .gc-queue-btn:disabled {
        background: var(--secondary);
        color: var(--muted);
        cursor: not-allowed;
      }
      .gc-queue-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Suggestions */
      .gc-suggestions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 12px;
        max-width: 680px;
        padding: 0 16px;
      }

      .gc-suggestion {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 24px;
        font-size: 14px;
        font-weight: 500;
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gc-suggestion:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
        transform: translateY(-2px);
      }
      .gc-suggestion-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--muted);
      }
      .gc-suggestion-icon svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Chat header bar (like original content-header) */
      .gc-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
        flex-shrink: 0;
      }
      .gc-chat-header__left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .gc-chat-header__session-select {
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 12px;
        color: var(--text, #ccc);
        padding: 4px 24px 4px 10px;
        border: 1px solid var(--border, rgba(255,255,255,.12));
        border-radius: 6px;
        background: var(--card, rgba(30,30,30,.5));
        cursor: pointer;
        max-width: 300px;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 6px center;
        background-size: 12px;
      }
      .gc-chat-header__session-select:hover {
        border-color: var(--accent, #7c3aed);
      }
      .gc-chat-header__session-select:focus {
        outline: none;
        border-color: var(--accent, #7c3aed);
        box-shadow: 0 0 0 2px rgba(124,58,237,.2);
      }
      .gc-chat-header__session-select option {
        background: var(--bg, #1a1a1a);
        color: var(--text, #ccc);
      }
      .gc-chat-header__right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .gc-header-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: 1px solid var(--border, rgba(255,255,255,.12));
        border-radius: 6px;
        color: var(--text-secondary, #888);
        cursor: pointer;
        transition: all .15s ease;
      }
      .gc-header-btn:hover {
        color: var(--text-primary, #fff);
        border-color: var(--text-secondary, #888);
        background: rgba(255,255,255,.06);
      }
      .gc-header-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .gc-header-btn svg {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Messages Area with Fade Effect */
      .gc-messages-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 0;
      }
      .gc-messages {
        position: relative;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        overflow-anchor: none;
        padding: 24px;
        padding-top: 24px;
        padding-bottom: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .gc-messages::-webkit-scrollbar {
        width: 10px;
      }
      .gc-messages::-webkit-scrollbar-track {
        background: transparent;
      }
      .gc-messages::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: var(--radius-full);
      }
      .gc-messages::-webkit-scrollbar-thumb:hover {
        background: var(--border-strong);
      }

      .gc-message {
        display: flex;
        gap: 16px;
        max-width: 800px;
      }
      /* Only animate newly added messages, not all on re-render */
      .gc-message.gc-message--new {
        animation: gc-msg-in 0.3s ease-out;
      }
      @keyframes gc-msg-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
      }

      .gc-message--user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }
      .gc-message--assistant {
        align-self: flex-start;
      }

      /* Scroll-to-bottom floating button */
      .gc-scroll-bottom {
        position: absolute;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%) scale(0.8);
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--card);
        border: 1px solid var(--border);
        color: var(--text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 10;
      }
      .gc-scroll-bottom.gc-scroll-bottom--visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) scale(1);
      }
      .gc-scroll-bottom:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .gc-scroll-bottom svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Dynamic spacer - height controlled by JS */
      .gc-scroll-spacer {
        flex-shrink: 0;
        height: 0;
      }

      .gc-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .gc-avatar--user {
        background: var(--accent-subtle);
        color: var(--accent);
      }
      .gc-avatar--assistant {
        background: linear-gradient(
          135deg,
          #4285f4 0%,
          #9b72cb 50%,
          #d96570 100%
        );
        position: relative;
      }
      /* Spinning border when loading */
      .gc-avatar--assistant.gc-avatar--loading::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        padding: 3px;
        background: conic-gradient(
          from 0deg,
          #4285f4,
          #9b72cb,
          #d96570,
          #4285f4
        );
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation: gc-avatar-spin 1.5s linear infinite;
      }
      @keyframes gc-avatar-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .gc-avatar svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .gc-avatar--assistant svg {
        stroke: white;
      }

      .gc-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .gc-content.gc-user-content {
        align-items: flex-end;
      }
      .gc-content.gc-assistant-content {
        align-items: flex-start;
      }
      .gc-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 4px;
      }
      .gc-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .gc-time {
        font-size: 11px;
        color: var(--muted);
      }
      .gc-message--user .gc-meta {
        justify-content: flex-end;
      }

      .gc-bubble {
        padding: 14px 18px;
        border-radius: 20px;
        font-size: 15px;
        line-height: 1.6;
      }
      .gc-bubble > p {
        margin-top: 8px;
        margin-bottom: 8px;
      }
      .gc-message--user .gc-bubble {
        background: var(--accent);
        color: var(--accent-foreground);
        border-bottom-right-radius: 6px;
      }
      .gc-message--assistant .gc-bubble {
        background: var(--card);
        color: var(--text);
        border: 1px solid var(--border);
        border-bottom-left-radius: 6px;
      }

      /* Links in chat bubbles */
      .gc-bubble a {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .gc-message--user .gc-bubble a {
        color: var(--accent-foreground);
      }
      .gc-message--assistant .gc-bubble a {
        color: var(--accent);
      }
      .gc-bubble a:hover {
        opacity: 0.8;
      }

      /* ── Table wrapper ── */
      .gc-bubble .gc-table-wrap {
        margin: 12px 0;
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .gc-bubble .gc-table-wrap::-webkit-scrollbar { height: 6px; }
      .gc-bubble .gc-table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

      /* ── Tables inside chat bubbles ── */
      .gc-bubble table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 14px;
      }
      .gc-bubble th,
      .gc-bubble td {
        padding: 11px 16px;
        text-align: left;
        border-bottom: 1px solid var(--border);
      }
      .gc-bubble th {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-strong);
        background: var(--bg-muted, var(--secondary));
        white-space: nowrap;
      }
      .gc-bubble td {
        color: var(--text);
      }
      .gc-bubble tbody tr:last-child td {
        border-bottom: none;
      }
      .gc-bubble tbody tr:nth-child(even) td {
        background: var(--bg-muted, rgba(0,0,0,0.02));
      }
      .gc-bubble tbody tr:hover td {
        background: var(--bg-hover);
      }
      /* User bubble table overrides */
      .gc-message--user .gc-bubble .gc-table-wrap {
        border-color: rgba(255,255,255,0.15);
      }
      .gc-message--user .gc-bubble th {
        background: rgba(255,255,255,0.12);
        color: var(--accent-foreground);
      }
      .gc-message--user .gc-bubble td {
        color: var(--accent-foreground);
        border-color: rgba(255,255,255,0.08);
      }
      .gc-message--user .gc-bubble tbody tr:nth-child(even) td {
        background: rgba(255,255,255,0.04);
      }
      .gc-message--user .gc-bubble tbody tr:hover td {
        background: rgba(255,255,255,0.08);
      }

      /* ── Code blocks inside chat bubbles ── */
      .gc-bubble .gc-code-wrap {
        position: relative;
        margin: 12px 0;
      }
      .gc-bubble .gc-code-copy {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--muted);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease, color 0.15s ease;
        z-index: 1;
        padding: 0;
      }
      .gc-bubble .gc-code-wrap:hover .gc-code-copy {
        opacity: 1;
      }
      .gc-bubble .gc-code-copy:hover {
        color: var(--text);
        border-color: var(--border-strong);
      }
      .gc-bubble .gc-code-copy.gc-code-copy--done {
        opacity: 1;
        color: var(--success, #22c55e);
      }
      .gc-bubble pre {
        margin: 0;
        padding: 14px 16px;
        background: var(--bg-muted, var(--secondary));
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.5;
      }
      .gc-bubble pre code {
        background: none;
        padding: 0;
        border: none;
        border-radius: 0;
        font-size: inherit;
        color: inherit;
      }
      .gc-bubble code {
        background: var(--bg-muted, var(--secondary));
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        font-size: 0.9em;
        font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
      }
      .gc-message--user .gc-bubble pre {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.15);
      }
      .gc-message--user .gc-bubble code {
        background: rgba(255,255,255,0.12);
      }

      /* ── Scrollbar for code blocks ── */
      .gc-bubble pre::-webkit-scrollbar { height: 6px; }
      .gc-bubble pre::-webkit-scrollbar-track { background: transparent; }
      .gc-bubble pre::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

      /* ── KaTeX math overrides ── */
      .gc-bubble .katex-display {
        margin: 16px 0;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 12px 0;
      }
      .gc-bubble .katex-display::-webkit-scrollbar { height: 4px; }
      .gc-bubble .katex-display::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      .gc-bubble .katex {
        font-size: 1.05em;
      }
      .gc-message--user .gc-bubble .katex {
        color: var(--accent-foreground);
      }

      /* ── Lists inside chat bubbles ── */
      .gc-bubble ul,
      .gc-bubble ol {
        margin: 8px 0;
        padding-left: 24px;
      }
      .gc-bubble li {
        margin: 4px 0;
      }

      /* ── Blockquotes inside chat bubbles ── */
      .gc-bubble blockquote {
        margin: 12px 0;
        padding: 8px 16px;
        border-left: 3px solid var(--accent);
        background: var(--bg-muted, var(--secondary));
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        color: var(--muted);
      }
      .gc-bubble blockquote p {
        margin: 4px 0;
      }

      /* ── Horizontal rule ── */
      .gc-bubble hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 16px 0;
      }

      /* Tool cards (matching original chat-tool-card) */
      .gc-tool-cards {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-top: 6px;
        margin-bottom: 4px;
      }
      .gc-tool-card {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        margin-top: 8px;
        background: var(--card);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        transition: border-color 150ms ease-out, background 150ms ease-out;
        max-height: 120px;
        overflow: hidden;
      }
      .gc-tool-card:first-child { margin-top: 0; }
      .gc-tool-card:hover {
        border-color: var(--border-strong);
        background: var(--bg-hover);
      }
      .gc-tool-card--running {
        border-color: var(--accent);
      }
      .gc-tool-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .gc-tool-card__title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 13px;
        line-height: 1.2;
      }
      .gc-tool-card__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .gc-tool-card__icon svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5px;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .gc-tool-card__status {
        display: inline-flex;
        align-items: center;
        color: var(--success, #22c55e);
      }
      .gc-tool-card__status svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2px;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .gc-tool-card__status--error {
        color: var(--destructive, #dc2626);
      }
      .gc-tool-card__spinner {
        display: inline-flex;
        align-items: center;
      }
      .gc-tool-card__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        animation: gc-pulse 1.2s ease-in-out infinite;
      }
      .gc-tool-card__detail {
        font-size: 12px;
        color: var(--muted);
        margin-top: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gc-tool-card__status-text {
        font-size: 11px;
        color: var(--muted);
        margin-top: 4px;
      }
      .gc-tool-card__preview {
        font-size: 11px;
        color: var(--muted);
        margin-top: 8px;
        padding: 8px 10px;
        background: var(--bg-muted, var(--secondary));
        border-radius: 6px;
        white-space: pre-wrap;
        overflow: hidden;
        max-height: 44px;
        line-height: 1.4;
        border: 1px solid var(--border);
        font-family: "SF Mono", "Fira Code", monospace;
      }

      /* Compaction toast (agent compressing context) */
      .gc-compaction-toast {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        margin: 8px 0;
        font-size: 13px;
        color: var(--text-secondary, #8b949e);
        background: var(--bg-secondary, rgba(255,255,255,0.03));
        border-radius: 8px;
        animation: gc-fade-in 0.3s ease;
      }
      .gc-compaction-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent, #646cff);
        animation: gc-pulse 1.5s ease-in-out infinite;
      }
      @keyframes gc-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      @keyframes gc-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Queue panel (matching original chat-queue) */
      /* Compact queue strip between messages and input */
      .gc-queue {
        padding: 6px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        border-top: 1px solid var(--border, rgba(255,255,255,.08));
        background: var(--card, rgba(30,30,30,.5));
      }
      .gc-queue__title {
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 11px;
        font-weight: 500;
        color: var(--muted, #888);
        white-space: nowrap;
      }
      .gc-queue__list {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        flex: 1;
        min-width: 0;
      }
      .gc-queue__item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px 3px 10px;
        border-radius: 14px;
        border: 1px dashed var(--border-strong, rgba(255,255,255,.15));
        background: var(--bg-muted, rgba(255,255,255,.05));
        max-width: 220px;
      }
      .gc-queue__text {
        font-size: 12px;
        line-height: 1.3;
        color: var(--text, #ccc);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gc-queue__remove {
        padding: 1px;
        background: transparent;
        border: none;
        border-radius: 50%;
        color: var(--muted, #888);
        cursor: pointer;
        display: flex;
        align-items: center;
        flex-shrink: 0;
        transition: color 0.1s;
      }
      .gc-queue__remove:hover {
        color: var(--destructive, #dc2626);
      }
      .gc-queue__remove svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Loading spinner - Gemini style */
      .gc-loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px 0;
      }
      .gc-loading-spinner {
        width: 32px;
        height: 32px;
        animation: gc-spin 1.5s linear infinite;
      }
      .gc-loading-spinner svg {
        width: 100%;
        height: 100%;
        stroke: none;
        fill: url(#gc-gradient);
      }
      @keyframes gc-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Streaming indicator next to name */
      .gc-streaming-indicator {
        display: inline-flex;
        align-items: center;
        margin-left: 8px;
      }
      .gc-streaming-indicator svg {
        width: 16px;
        height: 16px;
        animation: gc-pulse 1.2s ease-in-out infinite;
        stroke: none;
        fill: var(--accent);
      }
      @keyframes gc-pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.1); }
      }

      .gc-typing {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 0;
      }
      /* Inline typing dots after streaming text */
      .gc-typing-inline {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .gc-typing-inline .gc-typing-dot {
        width: 5px;
        height: 5px;
      }
      .gc-typing-dot {
        width: 6px;
        height: 6px;
        background: var(--muted);
        border-radius: 50%;
        animation: gc-typing 1.6s ease-in-out infinite;
      }
      .gc-typing-dot:nth-child(2) {
        animation-delay: 0.2s;
      }
      .gc-typing-dot:nth-child(3) {
        animation-delay: 0.4s;
      }
      @keyframes gc-typing {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }

      /* Streaming text - no animations */
      .gc-stream-text {
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* Blinking cursor */
      .gc-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        animation: gc-blink 1s step-end infinite;
        background: var(--text);
        margin-left: 1px;
        vertical-align: text-bottom;
      }
      @keyframes gc-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      /* Bottom Input - fixed at bottom */
      .gc-input-bottom {
        flex-shrink: 0;
        padding: 16px 24px 24px;
        background: var(--bg);
      }

      .gc-input-bottom .gc-input-wrap {
        max-width: 800px;
        margin: 0 auto;
        padding: 0;
      }

      .gc-disclaimer {
        text-align: center;
        font-size: 12px;
        color: var(--muted);
        margin-top: 8px;
      }

      /* Loading Skeleton */
      .gc-loading {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        gap: 24px;
      }
      .gc-skeleton {
        background: linear-gradient(
          90deg,
          var(--card) 25%,
          var(--bg-hover) 50%,
          var(--card) 75%
        );
        background-size: 200% 100%;
        animation: gc-shimmer 1.5s infinite;
        border-radius: 12px;
      }
      @keyframes gc-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
      .gc-skeleton-greeting {
        width: 200px;
        height: 32px;
        border-radius: 16px;
      }
      .gc-skeleton-title {
        width: 320px;
        height: 40px;
        border-radius: 20px;
      }
      .gc-skeleton-input {
        width: 100%;
        max-width: 680px;
        height: 80px;
        border-radius: 24px;
      }
      .gc-skeleton-suggestions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .gc-skeleton-pill {
        width: 140px;
        height: 44px;
        border-radius: 24px;
      }

      /* Responsive */
      @media (max-width: 768px) {
        .gc-wrapper {
          margin: -16px;
          height: calc(100% + 32px);
        }
        .gc-title {
          font-size: 20px;
        }
        .gc-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
        }
        .gc-logo svg {
          width: 24px;
          height: 24px;
        }
        .gc-suggestions {
          gap: 8px;
        }
        .gc-suggestion {
          padding: 10px 16px;
          font-size: 13px;
        }
        .gc-input-box {
          padding: 6px 6px 6px 16px;
        }
        .gc-input-bottom {
          padding: 12px 16px;
        }
      }
    </style>

    <div class="gc-wrapper">
      <!-- Main chat area -->
      <div class="gc-main">

        <!-- Chat header: session selector + refresh -->
        <div class="gc-chat-header">
          <div class="gc-chat-header__left">
            <select
              class="gc-chat-header__session-select"
              .value=${sessionKey}
              @change=${(e: Event) => {
                const sel = (e.target as HTMLSelectElement).value;
                onSessionChange?.(sel);
              }}
            >
              ${
                gatewaySessions.length > 0
                  ? html`${gatewaySessions.map((s) => {
                      const { label, description } = formatSessionDisplay(s);
                      const text = description ? `${label} — ${description}` : label;
                      return html`<option value=${s.key} ?selected=${s.key === sessionKey}>${text}</option>`;
                    })}${
                      // If current session isn't in the web-chat list, add it as an extra option
                      !gatewaySessions.some((s) => s.key === sessionKey)
                        ? html`<option value=${sessionKey} selected>${sessionKey.replace(/^agent:main:/, "")}</option>`
                        : nothing
                    }`
                  : html`<option value=${sessionKey} selected>${sessionKey.split(":").pop() || sessionKey}</option>`
              }
            </select>
          </div>
          <div class="gc-chat-header__right">
            ${
              onRefreshChat
                ? html`
              <button class="gc-header-btn" @click=${onRefreshChat} title="Tải lại">
                ${icons.refresh}
              </button>
            `
                : nothing
            }
          </div>
        </div>

      ${
        loading
          ? html`
              <!-- Loading Skeleton -->
              <div class="gc-loading">
                <div class="gc-skeleton gc-skeleton-greeting"></div>
                <div class="gc-skeleton gc-skeleton-title"></div>
                <div class="gc-skeleton gc-skeleton-input"></div>
                <div class="gc-skeleton-suggestions">
                  <div class="gc-skeleton gc-skeleton-pill"></div>
                  <div class="gc-skeleton gc-skeleton-pill"></div>
                  <div class="gc-skeleton gc-skeleton-pill"></div>
                  <div class="gc-skeleton gc-skeleton-pill"></div>
                </div>
              </div>
            `
          : isEmpty
            ? html`
              <!-- Empty State -->
              <div class="gc-welcome">
                <div class="gc-greeting">
                  <span class="gc-greeting-icon">${icons.sparkles}</span>
                  <span class="gc-greeting-text"
                    >${t("chatGreeting")}, ${displayName}!</span
                  >
                </div>
                <h1 class="gc-subtitle">${t("chatSubtitle")}</h1>

                <div class="gc-input-wrap">
                  <input type="file" class="gc-image-file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple
                    @change=${(e: Event) => {
                      const input = e.target as HTMLInputElement;
                      if (input.files?.length) onImageSelect(input.files);
                      input.value = "";
                    }}
                  />
                  <div class="gc-input-box">
                    <textarea
                      class="gc-input"
                      placeholder="${!gatewayReady ? "Đang chờ gateway khởi động..." : t("chatPlaceholder")}"
                      .value=${draft}
                      rows="1"
                      @input=${(e: InputEvent) => {
                        const textarea = e.target as HTMLTextAreaElement;
                        onDraftChange(textarea.value);
                        textarea.style.height = "auto";
                        textarea.style.height = Math.min(textarea.scrollHeight, 178) + "px";
                      }}
                      @keydown=${handleKeyDown}
                      @paste=${handlePaste}
                      ?disabled=${!gatewayReady}
                    ></textarea>
                    ${
                      pendingImages.length > 0
                        ? html`
                      <div class="gc-image-previews">
                        ${pendingImages.map(
                          (img, i) => html`
                          <div class="gc-image-preview">
                            <img src=${img.preview} alt="Preview" />
                            <button type="button" class="gc-image-preview-remove" @click=${() => onImageRemove(i)} title="Xóa">&times;</button>
                          </div>
                        `,
                        )}
                      </div>
                    `
                        : nothing
                    }
                    <div class="gc-input-actions">
                      <div class="gc-actions-left">
                        <button
                          type="button"
                          class="gc-action-btn gc-new-chat-btn"
                          title="Cuộc trò chuyện mới"
                          @click=${onNewConversation}
                        >
                          ${icons.messageSquarePlus}
                        </button>
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm ảnh"
                          @click=${(e: Event) => {
                            const btn = e.currentTarget as HTMLElement;
                            const fileInput = btn
                              .closest(".gc-input-wrap")
                              ?.querySelector<HTMLInputElement>(".gc-image-file-input");
                            fileInput?.click();
                          }}
                        >
                          ${icons.image}
                        </button>
                      </div>
                      <div class="gc-actions-right">
                        <button
                          type="button"
                          class="gc-send-btn"
                          @click=${handleSendClick}
                          ?disabled=${(!draft.trim() && pendingImages.length === 0) || sending || !gatewayReady}
                          title=${!gatewayReady ? "Đang chờ gateway..." : isLoggedIn ? t("chatSend") : t("chatSignIn")}
                        >
                          ${icons.arrowUp}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="gc-suggestions">
                  ${suggestions.map(
                    (s) => html`
                      <button
                        type="button"
                        class="gc-suggestion"
                        @click=${() => handleSuggestionClick(s.prompt)}
                      >
                        <span class="gc-suggestion-icon">${s.icon}</span>
                        ${s.label}
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
            : html`
              <!-- Chat Messages -->
              <div class="gc-messages-container">
                <button class="gc-scroll-bottom" @click=${handleScrollToBottom} title="Cuộn xuống">
                  ${icons.chevronDown}
                </button>
                <div class="gc-messages" @scroll=${handleScrollCheck}>
                  ${messages.map(
                    (msg, i) => html`
                      <div class="gc-message gc-message--${msg.role}${i === messages.length - 1 ? " gc-message--new" : ""}">
                        <div class="gc-avatar gc-avatar--${msg.role}">
                          ${msg.role === "user" ? icons.user : icons.sparkles}
                        </div>
                        <div
                          class="gc-content ${
                            msg.role === "user" ? "gc-user-content" : "gc-assistant-content"
                          }"
                        >
                          <div class="gc-meta">
                            <span class="gc-name"
                              >${msg.role === "user" ? displayName : botName}</span
                            >
                            ${
                              msg.timestamp
                                ? html`<span class="gc-time"
                                  >${formatTime(msg.timestamp)}</span
                                >`
                                : nothing
                            }
                          </div>
                          <div class="gc-bubble">
                            ${
                              msg.images?.length
                                ? html`
                              <div class="gc-bubble-images">
                                ${msg.images.map((img) => html`<img src=${img.preview} alt="Ảnh đính kèm" />`)}
                              </div>
                            `
                                : nothing
                            }
                            ${msg.content ? renderMarkdown(msg.content) : nothing}
                          </div>
                        </div>
                      </div>
                    `,
                  )}
                  ${
                    sending
                      ? html`
                        <div class="gc-message gc-message--assistant">
                          <div class="gc-avatar gc-avatar--assistant gc-avatar--loading">
                            ${icons.sparkles}
                          </div>
                          <div class="gc-content gc-assistant-content">
                            <div class="gc-meta">
                              <span class="gc-name">${botName}</span>
                            </div>
                            ${
                              toolCalls.length > 0
                                ? html`<div class="gc-tool-cards">
                                  ${toolCalls.map((tc) => {
                                    const toolIcon = resolveToolIcon(tc.name);
                                    const toolLabel = resolveToolLabel(tc.name);
                                    const detail = tc.detail
                                      ? shortenHomePath(tc.detail)
                                      : undefined;
                                    const isDone = tc.phase === "result";
                                    const isError = tc.isError;
                                    const hasOutput = Boolean(tc.output?.trim());
                                    const isRunning = !isDone;

                                    return html`
                                      <div class="gc-tool-card ${isRunning ? "gc-tool-card--running" : ""}">
                                        <div class="gc-tool-card__header">
                                          <div class="gc-tool-card__title">
                                            <span class="gc-tool-card__icon">${icons[toolIcon]}</span>
                                            <span>${toolLabel}</span>
                                          </div>
                                          ${
                                            isDone && !isError
                                              ? html`<span class="gc-tool-card__status">${icons.check}</span>`
                                              : nothing
                                          }
                                          ${
                                            isError
                                              ? html`<span class="gc-tool-card__status gc-tool-card__status--error">${icons.alertCircle}</span>`
                                              : nothing
                                          }
                                          ${
                                            isRunning
                                              ? html`
                                                  <span class="gc-tool-card__spinner"><span class="gc-tool-card__dot"></span></span>
                                                `
                                              : nothing
                                          }
                                        </div>
                                        ${detail ? html`<div class="gc-tool-card__detail">${detail}</div>` : nothing}
                                        ${
                                          isDone && !hasOutput
                                            ? html`
                                                <div class="gc-tool-card__status-text">Completed</div>
                                              `
                                            : nothing
                                        }
                                        ${
                                          hasOutput
                                            ? html`<div class="gc-tool-card__preview">${getTruncatedPreview(tc.output!)}</div>`
                                            : nothing
                                        }
                                      </div>`;
                                  })}
                                </div>`
                                : nothing
                            }
                            <div class="gc-bubble">
                              ${
                                streamingText
                                  ? html`<span class="gc-stream-text">${renderMarkdown(streamingText)}</span><span class="gc-typing-inline"><span class="gc-typing-dot"></span><span class="gc-typing-dot"></span><span class="gc-typing-dot"></span></span>`
                                  : html`
                                      <div class="gc-typing">
                                        <span class="gc-typing-dot"></span>
                                        <span class="gc-typing-dot"></span>
                                        <span class="gc-typing-dot"></span>
                                      </div>
                                    `
                              }
                            </div>
                          </div>
                        </div>
                      `
                      : nothing
                  }
                  ${
                    compactionActive
                      ? html`
                          <div class="gc-compaction-toast">
                            <span class="gc-compaction-dot"></span>
                            Cuộc trò chuyện quá dài, đang tóm tắt lại…
                          </div>
                        `
                      : nothing
                  }
                  <!-- Spacer to allow scrolling user message to top -->
                  <div class="gc-scroll-spacer"></div>
                </div>
              </div>

              <!-- Queue strip between messages and input (like original, compact) -->
              ${
                queue.length > 0
                  ? html`
                <div class="gc-queue" role="status" aria-live="polite">
                  <span class="gc-queue__title">Hàng chờ (${queue.length})</span>
                  <div class="gc-queue__list">
                    ${queue.map(
                      (item) => html`
                      <div class="gc-queue__item">
                        <span class="gc-queue__text">${item.text || (item.images?.length ? `Ảnh (${item.images.length})` : "")}</span>
                        ${
                          onQueueRemove
                            ? html`
                          <button class="gc-queue__remove" type="button" aria-label="Xóa" @click=${() => onQueueRemove(item.id)}>${icons.x}</button>
                        `
                            : nothing
                        }
                      </div>
                    `,
                    )}
                  </div>
                </div>
              `
                  : nothing
              }

              <!-- Bottom Input -->
              <div class="gc-input-bottom">
                <div class="gc-input-wrap">
                  <input type="file" class="gc-image-file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple
                    @change=${(e: Event) => {
                      const input = e.target as HTMLInputElement;
                      if (input.files?.length) onImageSelect(input.files);
                      input.value = "";
                    }}
                  />
                  <div class="gc-input-box">
                    <textarea
                      class="gc-input"
                      placeholder="${!gatewayReady ? "Đang chờ gateway khởi động..." : t("chatPlaceholder")}"
                      .value=${draft}
                      rows="1"
                      @input=${(e: InputEvent) => {
                        const textarea = e.target as HTMLTextAreaElement;
                        onDraftChange(textarea.value);
                        textarea.style.height = "auto";
                        textarea.style.height = Math.min(textarea.scrollHeight, 178) + "px";
                      }}
                      @keydown=${handleKeyDown}
                      @paste=${handlePaste}
                      ?disabled=${!gatewayReady}
                    ></textarea>
                    ${
                      pendingImages.length > 0
                        ? html`
                      <div class="gc-image-previews">
                        ${pendingImages.map(
                          (img, i) => html`
                          <div class="gc-image-preview">
                            <img src=${img.preview} alt="Preview" />
                            <button type="button" class="gc-image-preview-remove" @click=${() => onImageRemove(i)} title="Xóa">&times;</button>
                          </div>
                        `,
                        )}
                      </div>
                    `
                        : nothing
                    }
                    <div class="gc-input-actions">
                      <div class="gc-actions-left">
                        <button
                          type="button"
                          class="gc-action-btn gc-new-chat-btn"
                          title="Cuộc trò chuyện mới"
                          @click=${onNewConversation}
                        >
                          ${icons.messageSquarePlus}
                        </button>
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm ảnh"
                          @click=${(e: Event) => {
                            const btn = e.currentTarget as HTMLElement;
                            const fileInput = btn
                              .closest(".gc-input-wrap")
                              ?.querySelector<HTMLInputElement>(".gc-image-file-input");
                            fileInput?.click();
                          }}
                        >
                          ${icons.image}
                        </button>
                      </div>
                      <div class="gc-actions-right">
                        ${
                          sending
                            ? html`
                          <button
                            type="button"
                            class="gc-stop-btn"
                            @click=${onStop}
                            title="Dừng"
                          >Dừng</button>
                          <button
                            type="button"
                            class="gc-queue-btn"
                            @click=${handleSendClick}
                            ?disabled=${(!draft.trim() && pendingImages.length === 0) || !gatewayReady}
                            title="Thêm vào hàng chờ"
                          >Chờ ${icons.arrowUp}</button>
                        `
                            : html`
                          <button
                            type="button"
                            class="gc-send-btn"
                            @click=${handleSendClick}
                            ?disabled=${(!draft.trim() && pendingImages.length === 0) || !gatewayReady}
                            title=${!gatewayReady ? "Đang chờ gateway..." : isLoggedIn ? t("chatSend") : t("chatSignIn")}
                          >${icons.arrowUp}</button>
                        `
                        }
                      </div>
                    </div>
                  </div>
                </div>
                <p class="gc-disclaimer">${t("chatDisclaimer")}</p>
              </div>
            `
      }
      </div>
    </div>
  `;
}
