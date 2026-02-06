import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icons } from "../icons";

export type ConfirmVariant = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

/**
 * Confirmation dialog component
 * Use showConfirm() helper function for easy usage
 * @element operis-confirm
 */
@customElement("operis-confirm")
export class OperisConfirm extends LitElement {
  static override styles = css`
    :host {
      display: contents;
    }

    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: confirm-fade-in 0.15s ease-out;
    }

    @keyframes confirm-fade-in {
      from { opacity: 0; }
    }

    .confirm-dialog {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 400px;
      overflow: hidden;
      animation: confirm-slide-in 0.15s ease-out;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    @keyframes confirm-slide-in {
      from {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
      }
    }

    .confirm-content {
      padding: 24px;
      text-align: center;
    }

    .confirm-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: var(--bg-muted);
    }

    .confirm-icon svg {
      width: 24px;
      height: 24px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .confirm-icon--danger {
      background: var(--danger-subtle, rgba(239, 68, 68, 0.1));
      color: var(--danger, #ef4444);
    }

    .confirm-icon--default {
      background: var(--accent-subtle);
      color: var(--accent);
    }

    .confirm-title {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-strong);
    }

    .confirm-message {
      margin: 0;
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
    }

    .confirm-actions {
      display: flex;
      gap: 12px;
      padding: 16px 24px;
      background: var(--bg-muted);
      border-top: 1px solid var(--border);
    }

    .confirm-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .confirm-btn--cancel {
      background: var(--card);
      color: var(--text);
    }

    .confirm-btn--cancel:hover {
      background: var(--bg-hover);
      border-color: var(--border-strong);
    }

    .confirm-btn--confirm {
      background: var(--accent);
      color: var(--accent-foreground);
      border-color: var(--accent);
    }

    .confirm-btn--confirm:hover {
      background: var(--accent-hover, var(--accent));
      filter: brightness(1.1);
    }

    .confirm-btn--danger {
      background: var(--danger, #ef4444);
      color: white;
      border-color: var(--danger, #ef4444);
    }

    .confirm-btn--danger:hover {
      filter: brightness(1.1);
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) dialogTitle = "";
  @property({ type: String }) message = "";
  @property({ type: String }) confirmText = "Xác nhận";
  @property({ type: String }) cancelText = "Hủy";
  @property({ type: String }) variant: ConfirmVariant = "default";

  @state() private resolver: ((value: boolean) => void) | null = null;

  private handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.handleCancel();
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.handleCancel();
    }
  };

  private handleConfirm() {
    this.resolver?.(true);
    this.open = false;
    this.resolver = null;
  }

  private handleCancel() {
    this.resolver?.(false);
    this.open = false;
    this.resolver = null;
  }

  /**
   * Show the confirm dialog and return a Promise
   */
  show(options: ConfirmOptions): Promise<boolean> {
    this.dialogTitle = options.title;
    this.message = options.message;
    this.confirmText = options.confirmText ?? "Xác nhận";
    this.cancelText = options.cancelText ?? "Hủy";
    this.variant = options.variant ?? "default";
    this.open = true;

    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  override disconnectedCallback() {
    document.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  override render() {
    if (!this.open) return nothing;

    return html`
      <div class="confirm-overlay" @click=${this.handleOverlayClick}>
        <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <div class="confirm-content">
            <div class="confirm-icon confirm-icon--${this.variant}">
              ${this.variant === "danger" ? icons.alertCircle : icons.alertCircle}
            </div>
            <h2 class="confirm-title" id="confirm-title">${this.dialogTitle}</h2>
            <p class="confirm-message" id="confirm-message">${this.message}</p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" @click=${this.handleCancel}>
              ${this.cancelText}
            </button>
            <button class="confirm-btn ${this.variant === "danger" ? "confirm-btn--danger" : "confirm-btn--confirm"}" @click=${this.handleConfirm}>
              ${this.confirmText}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-confirm": OperisConfirm;
  }
}

// Singleton instance for easy usage
let confirmInstance: OperisConfirm | null = null;

function getConfirmInstance(): OperisConfirm {
  if (!confirmInstance) {
    confirmInstance = document.createElement("operis-confirm") as OperisConfirm;
    document.body.appendChild(confirmInstance);
  }
  return confirmInstance;
}

/**
 * Show a confirmation dialog
 * @example
 * const confirmed = await showConfirm({
 *   title: "Xóa workflow?",
 *   message: "Bạn có chắc muốn xóa workflow này?",
 *   confirmText: "Xóa",
 *   variant: "danger"
 * });
 * if (confirmed) {
 *   // Do delete
 * }
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return getConfirmInstance().show(options);
}
