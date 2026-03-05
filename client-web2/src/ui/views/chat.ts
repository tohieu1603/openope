import { html, nothing } from "lit";
import { t } from "../i18n";
import { icons } from "../icons";
import {
  formatTime,
  suggestions,
  resolveToolIcon,
  resolveToolLabel,
  getTruncatedPreview,
  shortenHomePath,
} from "./chat/chat-formatting";
import { renderMarkdown } from "./chat/chat-markdown";
import { formatSessionDisplay } from "./chat/chat-session-display";
import { chatStylesHtml } from "./chat/chat-styles";
import { renderModelSelector } from "./chat/model-selector";
import { renderThinkingControl, type ThinkingLevel } from "./chat/thinking-control";

export type {
  ChatMessage,
  ToolCallInfo,
  QueueItem,
  PendingImage,
  ChatProps,
} from "./chat/chat-types";
import type { ChatProps } from "./chat/chat-types";

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
    thinkingLevel = null,
    onThinkingChange,
    availableModels = [],
    currentModel = null,
    modelsLoading = false,
    onModelChange,
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
    ${chatStylesHtml}

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
              onThinkingChange
                ? renderThinkingControl({
                    level: (thinkingLevel as ThinkingLevel) || "off",
                    disabled: sending,
                    onLevelChange: onThinkingChange,
                  })
                : nothing
            }
            ${
              onModelChange
                ? renderModelSelector({
                    models: availableModels,
                    currentModel,
                    loading: modelsLoading,
                    disabled: sending,
                    onModelChange,
                  })
                : nothing
            }
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
                          <div class="gc-message-actions">
                            <button type="button" class="gc-msg-action-btn" title="Sao chép"
                              @click=${(e: Event) => {
                                const btn = e.currentTarget as HTMLElement;
                                navigator.clipboard.writeText(msg.content).then(() => {
                                  btn.classList.add("gc-msg-action-btn--done");
                                  btn.innerHTML =
                                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                                  setTimeout(() => {
                                    btn.classList.remove("gc-msg-action-btn--done");
                                    btn.innerHTML =
                                      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                                  }, 1500);
                                });
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
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
