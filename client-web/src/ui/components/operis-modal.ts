import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { icons } from "../icons";

/**
 * Modal dialog component
 * @element operis-modal
 *
 * @fires close - Fired when modal is closed
 */
@customElement("operis-modal")
export class OperisModal extends LitElement {
  static override styles = css`
    :host {
      display: contents;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: modal-fade-in 0.2s ease-out;
    }

    @keyframes modal-fade-in {
      from { opacity: 0; }
    }

    .modal {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 480px;
      max-height: calc(100vh - 48px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: modal-slide-in 0.2s ease-out;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    @keyframes modal-slide-in {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }

    .modal-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-strong);
    }

    .modal-close {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .modal-close:hover {
      background: var(--bg-hover);
      color: var(--text);
    }

    .modal-close svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      background: var(--bg-muted);
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) title = "";

  private handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.close();
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.close();
    }
  };

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
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
      <div class="modal-overlay" @click=${this.handleOverlayClick}>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 class="modal-title" id="modal-title">${this.title}</h2>
            <button class="modal-close" @click=${this.close} aria-label="Close">
              ${icons.x}
            </button>
          </div>
          <div class="modal-body">
            <slot></slot>
          </div>
          <div class="modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-modal": OperisModal;
  }
}
