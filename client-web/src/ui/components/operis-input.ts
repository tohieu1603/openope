import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { live } from "lit/directives/live.js";

/**
 * Custom input component with consistent styling
 * @element operis-input
 *
 * @fires input - Fired when value changes
 * @fires change - Fired when input loses focus after value change
 */
@customElement("operis-input")
export class OperisInput extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .input-wrapper {
      position: relative;
      width: 100%;
    }

    .input-field {
      width: 100%;
      padding: 10px 12px;
      font-size: 14px;
      font-family: inherit;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text);
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .input-field:hover:not(:disabled) {
      border-color: var(--border-strong);
    }

    .input-field:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .input-field::placeholder {
      color: var(--muted);
    }

    .input-field:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--bg-muted);
    }

    /* Size variants */
    :host([size="sm"]) .input-field {
      padding: 8px 10px;
      font-size: 13px;
    }

    :host([size="lg"]) .input-field {
      padding: 12px 16px;
      font-size: 16px;
    }

    /* Monospace variant */
    :host([mono]) .input-field {
      font-family: var(--mono);
      font-size: 13px;
    }

    /* With icon */
    :host([has-icon]) .input-field {
      padding-left: 38px;
    }

    .input-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: var(--muted);
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .input-icon ::slotted(svg) {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    /* Suffix (for units like "sec") */
    :host([has-suffix]) .input-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    :host([has-suffix]) .input-field {
      flex: 1;
    }

    .input-suffix {
      font-size: 13px;
      color: var(--muted);
      white-space: nowrap;
    }

    /* Error state */
    :host([error]) .input-field {
      border-color: var(--danger);
    }

    :host([error]) .input-field:focus {
      box-shadow: 0 0 0 2px var(--danger-subtle);
    }

    /* Textarea mode */
    .textarea-field {
      width: 100%;
      padding: 12px;
      font-size: 14px;
      font-family: inherit;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text);
      transition: all 0.15s ease;
      box-sizing: border-box;
      resize: vertical;
      min-height: 80px;
      line-height: 1.5;
    }

    .textarea-field:hover:not(:disabled) {
      border-color: var(--border-strong);
    }

    .textarea-field:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .textarea-field::placeholder {
      color: var(--muted);
    }

    .textarea-field:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--bg-muted);
    }
  `;

  @property({ type: String }) type: string = "text";
  @property({ type: String }) value: string = "";
  @property({ type: String }) placeholder: string = "";
  @property({ type: Boolean }) disabled: boolean = false;
  @property({ type: Boolean }) readonly: boolean = false;
  @property({ type: Boolean }) required: boolean = false;
  @property({ type: String }) name: string = "";
  @property({ type: String }) suffix: string = "";
  @property({ type: Number }) rows: number = 3;
  @property({ type: Number }) min?: number;
  @property({ type: Number }) max?: number;
  @property({ type: Number }) step?: number;
  @property({ type: String }) autocomplete: string = "off";

  private handleInput(e: Event) {
    e.stopPropagation();
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    this.value = target.value;
    this.dispatchEvent(new CustomEvent("input", {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  private handleChange(e: Event) {
    e.stopPropagation();
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    this.value = target.value;
    this.dispatchEvent(new CustomEvent("change", {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  override connectedCallback() {
    super.connectedCallback();
    // Set attributes for CSS styling
    if (this.suffix) {
      this.setAttribute("has-suffix", "");
    }
  }

  override render() {
    // Textarea mode
    if (this.type === "textarea") {
      return html`
        <textarea
          class="textarea-field"
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          name=${this.name || nothing}
          rows=${this.rows}
          @input=${this.handleInput}
          @change=${this.handleChange}
        ></textarea>
      `;
    }

    // Regular input
    return html`
      <div class="input-wrapper">
        <slot name="icon" class="input-icon"></slot>
        <input
          class="input-field"
          type=${this.type}
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          name=${this.name || nothing}
          min=${this.min ?? nothing}
          max=${this.max ?? nothing}
          step=${this.step ?? nothing}
          autocomplete=${this.autocomplete}
          inputmode=${this.type === "number" ? "numeric" : nothing}
          @input=${this.handleInput}
          @change=${this.handleChange}
        />
        ${this.suffix ? html`<span class="input-suffix">${this.suffix}</span>` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-input": OperisInput;
  }
}
