import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import flatpickr from "flatpickr";
import { Vietnamese } from "flatpickr/dist/l10n/vn.js";
import "flatpickr/dist/flatpickr.min.css";

// Custom styles to override flatpickr theme
const customStyles = document.createElement("style");
customStyles.id = "operis-flatpickr-theme";
customStyles.textContent = `
  .flatpickr-calendar {
    background: var(--card, #1a1a1a) !important;
    border: 1px solid var(--border, #333) !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4) !important;
    font-family: inherit !important;
  }

  .flatpickr-months {
    padding: 8px !important;
    border-bottom: 1px solid var(--border, #333) !important;
  }

  .flatpickr-current-month {
    color: var(--text-strong, #fff) !important;
    font-weight: 600 !important;
  }

  .flatpickr-current-month input.cur-year,
  .flatpickr-current-month .flatpickr-monthDropdown-months {
    background: transparent !important;
    color: var(--text-strong, #fff) !important;
    font-weight: 600 !important;
  }

  .flatpickr-prev-month,
  .flatpickr-next-month {
    fill: var(--muted, #888) !important;
  }

  .flatpickr-prev-month:hover,
  .flatpickr-next-month:hover {
    fill: var(--text, #fff) !important;
  }

  .flatpickr-weekdays {
    background: var(--bg, #111) !important;
  }

  .flatpickr-weekday {
    color: var(--muted, #888) !important;
    font-weight: 600 !important;
  }

  .flatpickr-day {
    color: var(--text, #ccc) !important;
    border-radius: 6px !important;
  }

  .flatpickr-day:hover {
    background: var(--bg-hover, #2a2a2a) !important;
    border-color: var(--bg-hover, #2a2a2a) !important;
  }

  .flatpickr-day.today {
    background: var(--accent-subtle, rgba(99, 102, 241, 0.15)) !important;
    border-color: var(--accent-subtle, rgba(99, 102, 241, 0.15)) !important;
    color: var(--accent, #6366f1) !important;
  }

  .flatpickr-day.selected,
  .flatpickr-day.selected:hover {
    background: var(--accent, #6366f1) !important;
    border-color: var(--accent, #6366f1) !important;
    color: #fff !important;
  }

  .flatpickr-day.prevMonthDay,
  .flatpickr-day.nextMonthDay {
    color: var(--muted, #555) !important;
  }

  .flatpickr-day.flatpickr-disabled {
    color: var(--muted, #444) !important;
  }

  .flatpickr-time {
    border-top: 1px solid var(--border, #333) !important;
    background: var(--bg, #111) !important;
  }

  .flatpickr-time input {
    background: var(--card, #1a1a1a) !important;
    border: 1px solid var(--border, #333) !important;
    border-radius: 6px !important;
    color: var(--text-strong, #fff) !important;
  }

  .flatpickr-time input:focus {
    border-color: var(--accent, #6366f1) !important;
  }

  .flatpickr-time-separator {
    color: var(--muted, #888) !important;
  }

  .numInputWrapper span {
    display: none !important;
  }
`;

// Inject styles once
if (!document.getElementById("operis-flatpickr-theme")) {
  document.head.appendChild(customStyles);
}

/**
 * Custom datetime picker component using Flatpickr
 * Uses light DOM for better Flatpickr compatibility
 */
@customElement("operis-datetime-picker")
export class OperisDatetimePicker extends LitElement {
  // Use light DOM for Flatpickr compatibility
  createRenderRoot() {
    return this;
  }

  @property({ type: String }) value = "";
  @property({ type: String }) placeholder = "Chọn ngày và giờ";
  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean, attribute: "enable-time" }) enableTime = true;
  @property({ type: String, attribute: "min-date" }) minDate = "today";

  private flatpickrInstance: flatpickr.Instance | null = null;

  override firstUpdated() {
    // Wait for DOM to be ready
    requestAnimationFrame(() => this.initFlatpickr());
  }

  override updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("value") && this.flatpickrInstance) {
      if (this.value) {
        this.flatpickrInstance.setDate(this.value, false);
      } else {
        this.flatpickrInstance.clear();
      }
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.flatpickrInstance?.destroy();
  }

  private initFlatpickr() {
    const input = this.querySelector(".odp-input") as HTMLInputElement;
    if (!input) return;

    this.flatpickrInstance = flatpickr(input, {
      enableTime: this.enableTime,
      time_24hr: true,
      dateFormat: "d/m/Y H:i",
      minDate: this.minDate,
      locale: Vietnamese,
      defaultDate: this.value || undefined,
      onChange: (selectedDates, dateStr) => {
        if (selectedDates.length > 0) {
          const isoValue = selectedDates[0].toISOString().slice(0, 16);
          this.dispatchEvent(
            new CustomEvent("change", {
              detail: { value: isoValue, displayValue: dateStr },
              bubbles: true,
              composed: true,
            })
          );
        }
      },
    });

    if (this.value) {
      this.flatpickrInstance.setDate(this.value, true);
    }
  }

  override render() {
    return html`
      <style>
        operis-datetime-picker {
          display: block;
          width: 100%;
        }
        .odp-wrapper {
          position: relative;
          width: 100%;
        }
        .odp-input {
          width: 100%;
          padding: 10px 12px;
          padding-right: 40px;
          font-size: 14px;
          font-family: inherit;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text);
          transition: all 0.15s ease;
          box-sizing: border-box;
          cursor: pointer;
        }
        .odp-input:hover:not(:disabled) {
          border-color: var(--border-strong);
        }
        .odp-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }
        .odp-input::placeholder {
          color: var(--muted);
        }
        .odp-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: var(--bg-muted);
        }
        .odp-icon {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          color: var(--muted);
          pointer-events: none;
        }
        .odp-icon svg {
          width: 18px;
          height: 18px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.5;
        }
      </style>
      <div class="odp-wrapper">
        <input
          type="text"
          class="odp-input"
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          readonly
        />
        <span class="odp-icon">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-datetime-picker": OperisDatetimePicker;
  }
}
