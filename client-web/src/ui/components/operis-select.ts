import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icons } from "../icons";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Custom select component with dropdown styling
 * @element operis-select
 *
 * @fires change - Fired when selection changes
 */
@customElement("operis-select")
export class OperisSelect extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      position: relative;
    }

    .select-trigger {
      width: 100%;
      padding: 10px 36px 10px 12px;
      font-size: 14px;
      font-family: inherit;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      box-sizing: border-box;
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .select-trigger:hover:not(:disabled) {
      border-color: var(--border-strong);
    }

    .select-trigger:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .select-trigger:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--bg-muted);
    }

    .select-trigger.open {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .select-value {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .select-placeholder {
      color: var(--muted);
    }

    .select-arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: var(--muted);
      pointer-events: none;
      transition: transform 0.15s ease;
    }

    .select-trigger.open .select-arrow {
      transform: translateY(-50%) rotate(180deg);
    }

    .select-arrow svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    /* Dropdown */
    .select-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 100;
      max-height: 240px;
      overflow-y: auto;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-8px);
      transition: all 0.15s ease;
    }

    .select-dropdown.open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .select-option {
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.1s ease;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .select-option:hover:not(.disabled) {
      background: var(--bg-hover);
    }

    .select-option.selected {
      background: var(--accent-subtle);
    }

    .select-option.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .select-option-label {
      font-size: 14px;
      color: var(--text);
    }

    .select-option.selected .select-option-label {
      color: var(--accent);
      font-weight: 500;
    }

    .select-option-desc {
      font-size: 12px;
      color: var(--muted);
    }

    /* Size variants */
    :host([size="sm"]) .select-trigger {
      padding: 8px 32px 8px 10px;
      font-size: 13px;
    }

    :host([size="sm"]) .select-option {
      padding: 8px 10px;
    }

    :host([size="lg"]) .select-trigger {
      padding: 12px 40px 12px 16px;
      font-size: 16px;
    }

    /* Searchable */
    .search-input {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      font-family: inherit;
      background: var(--bg);
      border: none;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      box-sizing: border-box;
    }

    .search-input:focus {
      outline: none;
      background: var(--bg-hover);
    }

    .search-input::placeholder {
      color: var(--muted);
    }

    /* No options */
    .no-options {
      padding: 16px 12px;
      text-align: center;
      font-size: 13px;
      color: var(--muted);
    }

    /* Native select fallback (hidden, for form submission) */
    .native-select {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
      pointer-events: none;
    }
  `;

  @property({ type: Array }) options: SelectOption[] = [];
  @property({ type: String }) value: string = "";
  @property({ type: String }) placeholder: string = "";
  @property({ type: Boolean }) disabled: boolean = false;
  @property({ type: Boolean }) searchable: boolean = false;
  @property({ type: String }) name: string = "";
  @property({ type: String }) searchPlaceholder: string = "Search...";

  @state() private isOpen: boolean = false;
  @state() private searchQuery: string = "";

  private get selectedOption(): SelectOption | undefined {
    return this.options.find(opt => opt.value === this.value);
  }

  private get filteredOptions(): SelectOption[] {
    if (!this.searchQuery) return this.options;
    const query = this.searchQuery.toLowerCase();
    return this.options.filter(opt =>
      opt.label.toLowerCase().includes(query) ||
      opt.description?.toLowerCase().includes(query)
    );
  }

  private handleTriggerClick() {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;
  }

  private handleOptionClick(option: SelectOption) {
    if (option.disabled) return;
    this.value = option.value;
    this.isOpen = false;
    this.searchQuery = "";
    this.dispatchEvent(new CustomEvent("change", {
      detail: { value: this.value, option },
      bubbles: true,
      composed: true,
    }));
  }

  private handleSearchInput(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.isOpen = false;
      this.searchQuery = "";
    } else if (e.key === "Enter" && this.isOpen) {
      const options = this.filteredOptions.filter(o => !o.disabled);
      if (options.length === 1) {
        this.handleOptionClick(options[0]);
      }
    }
  }

  private handleClickOutside = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this.isOpen = false;
      this.searchQuery = "";
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleClickOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this.handleClickOutside);
  }

  override render() {
    const selected = this.selectedOption;
    const filtered = this.filteredOptions;

    return html`
      <!-- Hidden native select for form submission -->
      <select class="native-select" name=${this.name || nothing} .value=${this.value}>
        ${this.options.map(opt => html`
          <option value=${opt.value} ?selected=${opt.value === this.value}>${opt.label}</option>
        `)}
      </select>

      <!-- Custom trigger -->
      <button
        type="button"
        class="select-trigger ${this.isOpen ? "open" : ""}"
        ?disabled=${this.disabled}
        @click=${this.handleTriggerClick}
        @keydown=${this.handleKeyDown}
      >
        <span class="select-value ${!selected ? "select-placeholder" : ""}">
          ${selected?.label || this.placeholder || "Select..."}
        </span>
        <span class="select-arrow">${icons.chevronDown}</span>
      </button>

      <!-- Dropdown -->
      <div class="select-dropdown ${this.isOpen ? "open" : ""}">
        ${this.searchable ? html`
          <input
            type="text"
            class="search-input"
            placeholder=${this.searchPlaceholder}
            .value=${this.searchQuery}
            @input=${this.handleSearchInput}
            @click=${(e: Event) => e.stopPropagation()}
          />
        ` : nothing}

        ${filtered.length === 0 ? html`
          <div class="no-options">No options found</div>
        ` : filtered.map(opt => html`
          <div
            class="select-option ${opt.value === this.value ? "selected" : ""} ${opt.disabled ? "disabled" : ""}"
            @click=${() => this.handleOptionClick(opt)}
          >
            <span class="select-option-label">${opt.label}</span>
            ${opt.description ? html`<span class="select-option-desc">${opt.description}</span>` : nothing}
          </div>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-select": OperisSelect;
  }
}
