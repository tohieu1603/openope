import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
}

/**
 * Global toast notification component
 * Usage:
 *   import { showToast } from "./components/operis-toast";
 *   showToast("Thành công!", "success");
 */
@customElement("operis-toast")
export class OperisToast extends LitElement {
  @state() private toasts: ToastMessage[] = [];
  private nextId = 1;

  static styles = css`
    :host {
      position: fixed;
      top: 80px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: var(--radius-md, 8px);
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease;
      pointer-events: all;
      max-width: 360px;
    }

    .toast.leaving {
      animation: slideOut 0.3s ease forwards;
    }

    .toast svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      flex-shrink: 0;
    }

    .toast-message {
      flex: 1;
      line-height: 1.4;
    }

    .toast-close {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.15s ease;
      color: inherit;
    }

    .toast-close:hover {
      opacity: 1;
    }

    .toast-close svg {
      width: 14px;
      height: 14px;
    }

    /* Types */
    .toast.success {
      background: #dcfce7;
      color: #16a34a;
    }

    .toast.error {
      background: #fee2e2;
      color: #dc2626;
    }

    .toast.info {
      background: #dbeafe;
      color: #2563eb;
    }

    .toast.warning {
      background: #fef3c7;
      color: #d97706;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes slideOut {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(20px);
      }
    }
  `;

  show(message: string, type: ToastType = "info", duration = 3000) {
    const id = this.nextId++;
    const toast: ToastMessage = { id, type, message, duration };
    this.toasts = [...this.toasts, toast];

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  private remove(id: number) {
    // Add leaving class for animation
    const toastEl = this.shadowRoot?.querySelector(`[data-id="${id}"]`);
    if (toastEl) {
      toastEl.classList.add("leaving");
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 300);
    } else {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }
  }

  private getIcon(type: ToastType) {
    switch (type) {
      case "success":
        return html`<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`;
      case "error":
        return html`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      case "warning":
        return html`<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      case "info":
      default:
        return html`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
  }

  render() {
    if (this.toasts.length === 0) return nothing;

    return html`
      ${this.toasts.map(
        (toast) => html`
          <div class="toast ${toast.type}" data-id="${toast.id}">
            ${this.getIcon(toast.type)}
            <span class="toast-message">${toast.message}</span>
            <button class="toast-close" @click=${() => this.remove(toast.id)}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `,
      )}
    `;
  }
}

// Global toast instance
let toastInstance: OperisToast | null = null;

function getToastInstance(): OperisToast {
  if (!toastInstance) {
    toastInstance = document.createElement("operis-toast") as OperisToast;
    document.body.appendChild(toastInstance);
  }
  return toastInstance;
}

/**
 * Show a toast notification
 * @param message - The message to display
 * @param type - Type of toast: "success" | "error" | "info" | "warning"
 * @param duration - Duration in ms (default 3000, 0 = no auto-dismiss)
 */
export function showToast(message: string, type: ToastType = "info", duration = 3000) {
  getToastInstance().show(message, type, duration);
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-toast": OperisToast;
  }
}
