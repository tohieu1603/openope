import katex from "katex";
import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import type { Conversation } from "../chat-api";
import { t } from "../i18n";
import { icons } from "../icons";

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

  return unsafeHTML(htmlContent);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | Date;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  phase: "start" | "update" | "result";
  isError?: boolean;
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
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onLoginClick: () => void;
  onScroll?: (e: Event) => void;
  // Sidebar props
  conversations?: Conversation[];
  conversationsLoading?: boolean;
  currentConversationId?: string | null;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
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
    onDraftChange,
    onSend,
    onStop,
    onLoginClick,
    onScroll,
    conversations = [],
    conversationsLoading = false,
    currentConversationId = null,
    sidebarCollapsed = false,
    onToggleSidebar,
    onNewConversation,
    onSwitchConversation,
    onDeleteConversation,
  } = props;
  const isEmpty = messages.length === 0;
  const displayName = username || "Bạn";

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
    if (!isLoggedIn) {
      onLoginClick();
    } else {
      onSend();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    onDraftChange(prompt + " ");
  };

  return html`
    <style>
      /* Full-width Chat Container - grid with sidebar + main */
      .gc-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: grid;
        grid-template-columns: 280px 1fr;
        background: var(--bg);
        overflow: hidden;
        transition: grid-template-columns 0.2s ease;
      }
      .gc-wrapper.gc-sidebar-collapsed {
        grid-template-columns: 0px 1fr;
      }
      .gc-main {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      /* Sidebar */
      .gc-sidebar {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--border);
        background: var(--bg);
        overflow: hidden;
        min-width: 0;
        transition: opacity 0.2s ease;
      }
      .gc-sidebar-collapsed .gc-sidebar {
        opacity: 0;
        pointer-events: none;
      }
      .gc-sidebar-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .gc-sidebar-title {
        flex: 1;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .gc-sidebar-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 8px);
        color: var(--muted);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gc-sidebar-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
      }
      .gc-sidebar-btn svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .gc-sidebar-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .gc-sidebar-list::-webkit-scrollbar { width: 6px; }
      .gc-sidebar-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      .gc-sidebar-empty {
        padding: 24px 16px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
      }

      /* Conversation item */
      .gc-conv-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.15s ease;
      }
      .gc-conv-item:hover { background: var(--bg-hover); }
      .gc-conv-item--active {
        background: var(--accent-subtle);
        border-color: var(--accent-subtle);
      }
      .gc-conv-item-content { flex: 1; min-width: 0; }
      .gc-conv-item-preview {
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gc-conv-item--active .gc-conv-item-preview { color: var(--text-strong); }
      .gc-conv-item-meta {
        font-size: 11px;
        color: var(--muted);
        margin-top: 2px;
      }
      .gc-conv-item-delete {
        width: 28px;
        height: 28px;
        display: none;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 8px);
        color: var(--muted);
        cursor: pointer;
        flex-shrink: 0;
      }
      .gc-conv-item:hover .gc-conv-item-delete { display: flex; }
      .gc-conv-item-delete:hover { background: var(--destructive, #dc2626); color: white; }
      .gc-conv-item-delete svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }

      /* Open sidebar button (shown when collapsed) */
      .gc-sidebar-open-btn {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 10;
        width: 32px;
        height: 32px;
        display: none;
        align-items: center;
        justify-content: center;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md, 8px);
        color: var(--muted);
        cursor: pointer;
      }
      .gc-sidebar-open-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.5; }
      .gc-sidebar-open-btn:hover { background: var(--bg-hover); color: var(--text); }
      .gc-sidebar-collapsed .gc-sidebar-open-btn { display: flex; }

      @media (max-width: 768px) {
        .gc-wrapper { grid-template-columns: 1fr; }
        .gc-sidebar {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: 220px;
          z-index: 50;
          box-shadow: 4px 0 20px rgba(0,0,0,0.15);
          transition: transform 0.25s ease;
        }
        .gc-sidebar-collapsed .gc-sidebar { transform: translateX(-100%); opacity: 1; pointer-events: auto; }
        .gc-sidebar-collapsed .gc-sidebar-open-btn { display: flex; }
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
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--destructive, #dc2626);
        border: none;
        border-radius: 50%;
        color: white;
        cursor: pointer;
        transition: all 0.15s ease;
        animation: gc-stop-pop 0.2s ease-out;
      }
      .gc-stop-btn:hover {
        background: var(--destructive-hover, #b91c1c);
        transform: scale(1.05);
      }
      .gc-stop-btn svg {
        width: 16px;
        height: 16px;
      }
      @keyframes gc-stop-pop {
        from { transform: scale(0.8); opacity: 0.5; }
        to { transform: scale(1); opacity: 1; }
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
      .gc-bubble pre {
        margin: 12px 0;
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

      /* Tool call pills */
      .gc-tool-calls {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
        margin-bottom: 2px;
      }
      .gc-tool-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: var(--bg-muted, var(--secondary));
        border: 1px solid var(--border);
        border-radius: 12px;
        font-size: 12px;
        font-family: "SF Mono", "Fira Code", monospace;
        color: var(--muted);
        line-height: 1.4;
      }
      .gc-tool-pill--running {
        border-color: var(--accent);
        color: var(--accent);
      }
      .gc-tool-pill--done {
        border-color: var(--success, #22c55e);
        color: var(--success, #22c55e);
      }
      .gc-tool-pill--error {
        border-color: var(--destructive, #dc2626);
        color: var(--destructive, #dc2626);
      }
      .gc-tool-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }
      .gc-tool-pill--running .gc-tool-dot {
        animation: gc-pulse 1.2s ease-in-out infinite;
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

    <div class="gc-wrapper ${sidebarCollapsed ? "gc-sidebar-collapsed" : ""}">
      <!-- Sidebar -->
      <aside class="gc-sidebar">
        <div class="gc-sidebar-header">
          <button class="gc-sidebar-btn" @click=${onToggleSidebar} title="Thu gọn">
            ${icons.panelLeft}
          </button>
          <span class="gc-sidebar-title">${t("chatSidebarTitle")}</span>
          <button class="gc-sidebar-btn" @click=${onNewConversation} title="${t("chatSidebarNew")}">
            ${icons.messageSquarePlus}
          </button>
        </div>
        <div class="gc-sidebar-list">
          ${
            conversationsLoading
              ? html`${[1, 2, 3, 4].map(
                  () =>
                    html`
                      <div class="gc-skeleton" style="height: 52px; border-radius: 8px; margin-bottom: 8px"></div>
                    `,
                )}`
              : conversations.length === 0
                ? html`<div class="gc-sidebar-empty">${t("chatSidebarEmpty")}</div>`
                : conversations.map(
                    (conv) => html`
                  <div
                    class="gc-conv-item ${conv.conversation_id === currentConversationId ? "gc-conv-item--active" : ""}"
                    @click=${() => onSwitchConversation?.(conv.conversation_id)}
                  >
                    <div class="gc-conv-item-content">
                      <div class="gc-conv-item-preview">${conv.last_message ? conv.last_message.slice(0, 60).replace(/\n/g, " ") : t("chatSidebarNoPreview")}</div>
                      <div class="gc-conv-item-meta">${formatTime(conv.created_at)}</div>
                    </div>
                    <button
                      class="gc-conv-item-delete"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        onDeleteConversation?.(conv.conversation_id);
                      }}
                      title="Xóa"
                    >${icons.trash}</button>
                  </div>
                `,
                  )
          }
        </div>
      </aside>

      <!-- Main chat area -->
      <div class="gc-main">
        <button class="gc-sidebar-open-btn" @click=${onToggleSidebar} title="Mở sidebar">
          ${icons.panelLeft}
        </button>
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
                  <div class="gc-input-box">
                    <textarea
                      class="gc-input"
                      placeholder="${t("chatPlaceholder")}"
                      .value=${draft}
                      rows="1"
                      @input=${(e: InputEvent) => {
                        const textarea = e.target as HTMLTextAreaElement;
                        onDraftChange(textarea.value);
                        textarea.style.height = "auto";
                        textarea.style.height = Math.min(textarea.scrollHeight, 178) + "px";
                      }}
                      @keydown=${handleKeyDown}
                      ?disabled=${sending}
                    ></textarea>
                    <div class="gc-input-actions">
                      <div class="gc-actions-left">
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm tệp"
                        >
                          ${icons.plus}
                        </button>
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm ảnh"
                        >
                          ${icons.image}
                        </button>
                      </div>
                      <div class="gc-actions-right">
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Nhập giọng nói"
                        >
                          ${icons.mic}
                        </button>
                        <button
                          type="button"
                          class="gc-send-btn"
                          @click=${handleSendClick}
                          ?disabled=${!draft.trim() || sending}
                          title=${isLoggedIn ? t("chatSend") : t("chatSignIn")}
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
                <div class="gc-messages" @scroll=${onScroll}>
                  ${messages.map(
                    (msg) => html`
                      <div class="gc-message gc-message--${msg.role}">
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
                            ${renderMarkdown(msg.content)}
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
                                ? html`<div class="gc-tool-calls">
                                  ${toolCalls.map((tc) => {
                                    const cls =
                                      tc.phase === "result"
                                        ? tc.isError
                                          ? "gc-tool-pill--error"
                                          : "gc-tool-pill--done"
                                        : "gc-tool-pill--running";
                                    return html`<span class="gc-tool-pill ${cls}"><span class="gc-tool-dot"></span>${tc.name}</span>`;
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
                  <!-- Spacer to allow scrolling user message to top -->
                  <div class="gc-scroll-spacer"></div>
                </div>
              </div>

              <!-- Bottom Input -->
              <div class="gc-input-bottom">
                <div class="gc-input-wrap">
                  <div class="gc-input-box">
                    <textarea
                      class="gc-input"
                      placeholder="${t("chatPlaceholder")}"
                      .value=${draft}
                      rows="1"
                      @input=${(e: InputEvent) => {
                        const textarea = e.target as HTMLTextAreaElement;
                        onDraftChange(textarea.value);
                        textarea.style.height = "auto";
                        textarea.style.height = Math.min(textarea.scrollHeight, 178) + "px";
                      }}
                      @keydown=${handleKeyDown}
                      ?disabled=${sending}
                    ></textarea>
                    <div class="gc-input-actions">
                      <div class="gc-actions-left">
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm tệp"
                        >
                          ${icons.plus}
                        </button>
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Thêm ảnh"
                        >
                          ${icons.image}
                        </button>
                      </div>
                      <div class="gc-actions-right">
                        <button
                          type="button"
                          class="gc-action-btn"
                          title="Nhập giọng nói"
                        >
                          ${icons.mic}
                        </button>
                        ${
                          sending
                            ? html`<button
                              type="button"
                              class="gc-stop-btn"
                              @click=${onStop}
                              title="Dừng"
                            >
                              ${icons.stop}
                            </button>`
                            : html`<button
                              type="button"
                              class="gc-send-btn"
                              @click=${handleSendClick}
                              ?disabled=${!draft.trim()}
                              title=${isLoggedIn ? t("chatSend") : t("chatSignIn")}
                            >
                              ${icons.arrowUp}
                            </button>`
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
