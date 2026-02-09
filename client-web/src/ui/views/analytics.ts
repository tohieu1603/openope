import { html, nothing } from "lit";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { icons } from "../icons";
import type { DailyUsage, TypeUsage, UsageStats } from "../analytics-api";

const Vietnamese: flatpickr.CustomLocale = {
  weekdays: { shorthand: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"], longhand: ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] },
  months: { shorthand: ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"], longhand: ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"] },
  firstDayOfWeek: 1,
  rangeSeparator: " đến ",
};

// Module-level ref to avoid stale closure in flatpickr onChange
let _onRangeChange: ((start: string, end: string) => void) | null = null;

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function initDatePicker(el: HTMLElement, isStart: boolean) {
  if ((el as any)._flatpickr) {
    (el as any)._flatpickr.open();
    return;
  }
  const fp = flatpickr(el, {
    locale: Vietnamese,
    dateFormat: "d/m/Y",
    maxDate: "today",
    onChange: ([date]) => {
      if (!date) return;
      const iso = toISO(date);
      // Read the other picker's selected date from DOM
      const container = el.closest(".date-range-picker");
      const otherEl = container?.querySelector(isStart ? ".fp-end" : ".fp-start") as any;
      const otherDate = otherEl?._flatpickr?.selectedDates[0];
      const otherIso = otherDate ? toISO(otherDate) : "";
      if (isStart) _onRangeChange?.(iso, otherIso);
      else _onRangeChange?.(otherIso, iso);
    },
  });
  fp.open();
}

export interface AnalyticsProps {
  loading?: boolean;
  error?: string | null;
  // Token balance
  tokenBalance?: number;
  // Usage stats
  stats?: UsageStats | null;
  // Previous period stats (for comparison)
  prevStats?: UsageStats | null;
  // Daily usage data
  dailyUsage?: DailyUsage[];
  // Type breakdown (chat, cronjob, api)
  typeUsage?: TypeUsage[];
  // Period selection
  selectedPeriod?: "1d" | "7d" | "30d" | "90d" | "custom";
  onPeriodChange?: (period: "1d" | "7d" | "30d" | "90d" | "custom") => void;
  // Custom date range
  rangeStart?: string;
  rangeEnd?: string;
  onRangeChange?: (start: string, end: string) => void;
  // Refresh
  onRefresh?: () => void;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// Type labels and colors
const TYPE_CONFIG: Record<string, { label: string; color: string; gradient: string }> = {
  chat: { label: "Chat", color: "#3b82f6", gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" },
  cronjob: { label: "Workflow", color: "#10b981", gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)" },
  api: { label: "API", color: "#f59e0b", gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" },
};

// Calculate trend percentage
function calcTrend(current: number, previous: number): { value: number; isUp: boolean } {
  if (previous === 0) return { value: 0, isUp: true };
  const change = ((current - previous) / previous) * 100;
  return { value: Math.abs(change), isUp: change >= 0 };
}

// Render area/bar chart with gradient
function renderAreaChart(data: DailyUsage[], maxTokens: number) {
  if (!data || data.length === 0) {
    return html`<div class="chart-empty">
      <div class="chart-empty-icon">${icons.barChart}</div>
      <div class="chart-empty-text">Chưa có dữ liệu sử dụng</div>
    </div>`;
  }

  // Generate Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((p) => formatNumber(Math.round(maxTokens * p)));

  return html`
    <div class="area-chart">
      <!-- Y-axis labels -->
      <div class="chart-y-axis">
        ${yLabels.reverse().map((label) => html`<span class="y-label">${label}</span>`)}
      </div>

      <!-- Chart area -->
      <div class="chart-main">
        <!-- Grid lines -->
        <div class="chart-grid">
          ${[0, 1, 2, 3, 4].map(() => html`<div class="grid-line"></div>`)}
        </div>

        <!-- Bars -->
        <div class="chart-bars">
          ${data.map(
            (day, i) => html`
              <div class="bar-col" style="--delay: ${i * 30}ms">
                <div class="bar-tooltip">
                  <strong>${formatNumber(day.tokensUsed)}</strong> tokens
                  <br />
                  <span class="tooltip-date">${formatDate(day.date)}</span>
                </div>
                <div
                  class="bar-fill"
                  style="height: ${maxTokens > 0 ? (day.tokensUsed / maxTokens) * 100 : 0}%"
                ></div>
              </div>
            `,
          )}
        </div>

        <!-- X-axis labels -->
        <div class="chart-x-axis">
          ${data.map(
            (day, i) =>
              // Show fewer labels on mobile
              i % Math.ceil(data.length / 7) === 0 || i === data.length - 1
                ? html`<span class="x-label">${formatDate(day.date)}</span>`
                : html`<span class="x-label"></span>`,
          )}
        </div>
      </div>
    </div>
  `;
}

// Render donut chart for type breakdown
function renderDonutChart(types: TypeUsage[]) {
  if (!types || types.length === 0) {
    return html`<div class="chart-empty small">
      <div class="chart-empty-icon">${icons.barChart}</div>
      <div class="chart-empty-text">Chưa có dữ liệu</div>
    </div>`;
  }

  // Calculate donut segments
  let offset = 0;
  const segments = types.map((t) => {
    const config = TYPE_CONFIG[t.type] || { label: t.type, color: "#8b5cf6", gradient: "" };
    const segment = {
      ...t,
      ...config,
      dashArray: `${t.percentage} ${100 - t.percentage}`,
      dashOffset: -offset,
    };
    offset += t.percentage;
    return segment;
  });

  const totalTokens = types.reduce((sum, t) => sum + t.tokensUsed, 0);

  return html`
    <div class="donut-chart-container">
      <div class="donut-chart">
        <svg viewBox="0 0 42 42" class="donut-svg">
          <!-- Background circle -->
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--border)" stroke-width="3" />
          <!-- Segments -->
          ${segments.map(
            (seg, i) => html`
              <circle
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke="${seg.color}"
                stroke-width="3"
                stroke-dasharray="${seg.dashArray}"
                stroke-dashoffset="${seg.dashOffset}"
                stroke-linecap="round"
                class="donut-segment"
                style="--delay: ${i * 150}ms"
              />
            `,
          )}
        </svg>
        <div class="donut-center">
          <div class="donut-total">${formatNumber(totalTokens)}</div>
          <div class="donut-label">tokens</div>
        </div>
      </div>

      <!-- Legend -->
      <div class="donut-legend">
        ${segments.map(
          (seg) => html`
            <div class="legend-item">
              <div class="legend-color" style="background: ${seg.color}"></div>
              <div class="legend-info">
                <span class="legend-name">${seg.label}</span>
                <span class="legend-value">${formatNumber(seg.tokensUsed)}</span>
              </div>
              <span class="legend-percent">${seg.percentage.toFixed(0)}%</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderAnalytics(props: AnalyticsProps) {
  // Update module-level ref so flatpickr onChange always calls the latest callback
  _onRangeChange = props.onRangeChange ?? null;

  const loading = props.loading ?? false;
  const error = props.error ?? null;
  const tokenBalance = props.tokenBalance ?? 0;
  const stats = props.stats ?? null;
  const prevStats = props.prevStats ?? null;
  const dailyUsage = props.dailyUsage ?? [];
  const typeUsage = props.typeUsage ?? [];
  const selectedPeriod = props.selectedPeriod ?? "30d";

  const maxTokens = Math.max(...dailyUsage.map((d) => d.tokensUsed), 1);

  // Calculate trends
  const tokenTrend = prevStats ? calcTrend(stats?.totalTokens ?? 0, prevStats.totalTokens) : null;
  const requestTrend = prevStats ? calcTrend(stats?.totalRequests ?? 0, prevStats.totalRequests) : null;

  return html`
    <style>
      .analytics-layout {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* Header */
      .analytics-header {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 16px;
      }
      .header-actions {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .period-selector {
        display: flex;
        background: var(--secondary);
        border-radius: var(--radius-lg);
        padding: 4px;
        gap: 4px;
      }
      .period-btn {
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        background: transparent;
        border: none;
        border-radius: var(--radius-md);
        color: var(--muted);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .period-btn:hover {
        color: var(--text);
      }
      .period-btn.active {
        background: var(--card);
        color: var(--text-strong);
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .date-range-picker {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .date-input {
        padding: 7px 12px;
        font-size: 13px;
        font-weight: 500;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        outline: none;
        cursor: pointer;
        transition: border-color 0.2s ease;
        width: 120px;
      }
      .date-input:focus, .date-input.active {
        border-color: var(--accent);
      }
      .date-range-sep {
        color: var(--muted);
        font-size: 14px;
      }
      .refresh-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .refresh-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .refresh-btn svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Stats Grid */
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
      }
      @media (max-width: 1100px) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (max-width: 600px) {
        .stats-grid {
          grid-template-columns: 1fr;
        }
      }

      .stat-card {
        position: relative;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        padding: 24px;
        overflow: hidden;
        transition: all 0.2s ease;
      }
      .stat-card:hover {
        border-color: var(--border-strong);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px -8px rgba(0,0,0,0.15);
      }
      .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--stat-gradient, var(--accent));
      }
      .stat-card.balance::before {
        --stat-gradient: linear-gradient(90deg, #10b981 0%, #34d399 100%);
      }
      .stat-card.tokens::before {
        --stat-gradient: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
      }
      .stat-card.requests::before {
        --stat-gradient: linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%);
      }
      .stat-card.io::before {
        --stat-gradient: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
      }

      .stat-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .stat-icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary);
        border-radius: var(--radius-lg);
        color: var(--muted);
      }
      .stat-icon svg {
        width: 22px;
        height: 22px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .stat-trend {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
      }
      .stat-trend.up {
        background: var(--success-subtle, #dcfce7);
        color: var(--success, #16a34a);
      }
      .stat-trend.down {
        background: var(--danger-subtle, #fee2e2);
        color: var(--danger, #dc2626);
      }
      .stat-trend svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      .stat-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stat-label {
        font-size: 13px;
        color: var(--muted);
        font-weight: 500;
      }
      .stat-value {
        font-size: 32px;
        font-weight: 700;
        color: var(--text-strong);
        line-height: 1.2;
      }
      .stat-sub {
        font-size: 13px;
        color: var(--muted);
        margin-top: 4px;
      }
      .stat-sub span {
        color: var(--text);
        font-weight: 500;
      }

      /* Custom tooltip for stat values */
      [data-tooltip] {
        position: relative;
        cursor: default;
      }
      [data-tooltip]::before,
      [data-tooltip]::after {
        position: absolute;
        left: 50%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      [data-tooltip]::after {
        content: attr(data-tooltip);
        bottom: calc(100% + 8px);
        transform: translateX(-50%) translateY(4px);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        background: var(--text-strong, #1a1a2e);
        color: var(--bg, #fff);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10;
      }
      [data-tooltip]::before {
        content: "";
        bottom: calc(100% + 2px);
        transform: translateX(-50%) translateY(4px);
        border: 5px solid transparent;
        border-top-color: var(--text-strong, #1a1a2e);
        z-index: 10;
      }
      [data-tooltip]:hover::before,
      [data-tooltip]:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Charts Row */
      .charts-row {
        display: grid;
        grid-template-columns: 1.8fr 1fr;
        gap: 24px;
      }
      @media (max-width: 1000px) {
        .charts-row {
          grid-template-columns: 1fr;
        }
      }

      /* Card Styles */
      .a-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }
      .a-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
      }
      .a-card-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .a-card-subtitle {
        font-size: 13px;
        color: var(--muted);
        margin-top: 2px;
      }
      .a-card-body {
        padding: 24px;
      }

      /* Area/Bar Chart */
      .area-chart {
        display: flex;
        gap: 16px;
        height: 280px;
      }
      .chart-y-axis {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 8px 0 32px 0;
        min-width: 50px;
      }
      .y-label {
        font-size: 11px;
        color: var(--muted);
        text-align: right;
      }
      .chart-main {
        flex: 1;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .chart-grid {
        position: absolute;
        inset: 0 0 32px 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .grid-line {
        border-bottom: 1px dashed var(--border);
      }
      .chart-bars {
        flex: 1;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        padding-bottom: 32px;
        position: relative;
        z-index: 1;
      }
      .bar-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        height: 100%;
        position: relative;
        animation: barGrow 0.6s ease-out backwards;
        animation-delay: var(--delay, 0ms);
      }
      @keyframes barGrow {
        from {
          opacity: 0;
          transform: scaleY(0);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      .bar-fill {
        width: 100%;
        max-width: 32px;
        min-height: 4px;
        background: linear-gradient(180deg, var(--accent) 0%, var(--accent-hover, var(--accent)) 100%);
        border-radius: 6px 6px 2px 2px;
        transition: all 0.2s ease;
        cursor: pointer;
        position: relative;
      }
      .bar-fill:hover {
        filter: brightness(1.1);
        transform: scaleX(1.1);
      }
      .bar-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--text-strong);
        color: var(--bg);
        padding: 8px 12px;
        border-radius: var(--radius-md);
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.15s ease;
        z-index: 10;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .bar-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: var(--text-strong);
      }
      .tooltip-date {
        color: var(--muted);
      }
      .bar-col:hover .bar-tooltip {
        opacity: 1;
        visibility: visible;
      }
      .chart-x-axis {
        display: flex;
        justify-content: space-between;
        height: 32px;
        align-items: flex-start;
        padding-top: 8px;
      }
      .x-label {
        font-size: 11px;
        color: var(--muted);
        flex: 1;
        text-align: center;
      }

      /* Donut Chart */
      .donut-chart-container {
        display: flex;
        flex-direction: column;
        gap: 24px;
        align-items: center;
      }
      .donut-chart {
        position: relative;
        width: 180px;
        height: 180px;
      }
      .donut-svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      .donut-segment {
        animation: donutDraw 1s ease-out forwards;
        animation-delay: var(--delay, 0ms);
        stroke-dasharray: 0 100;
      }
      @keyframes donutDraw {
        to {
          stroke-dasharray: var(--target, 0 100);
        }
      }
      .donut-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .donut-total {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-strong);
      }
      .donut-label {
        font-size: 13px;
        color: var(--muted);
      }

      .donut-legend {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--bg);
        border-radius: var(--radius-md);
        transition: all 0.15s ease;
      }
      .legend-item:hover {
        background: var(--secondary);
      }
      .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .legend-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .legend-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text);
      }
      .legend-value {
        font-size: 12px;
        color: var(--muted);
      }
      .legend-percent {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong);
      }

      /* Empty State */
      .chart-empty {
        height: 280px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: var(--muted);
      }
      .chart-empty.small {
        height: 200px;
      }
      .chart-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary);
        border-radius: var(--radius-lg);
      }
      .chart-empty-icon svg {
        width: 24px;
        height: 24px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 1.5;
      }
      .chart-empty-text {
        font-size: 14px;
      }

      /* Error */
      .error-message {
        padding: 16px 20px;
        background: var(--danger-subtle);
        color: var(--danger);
        border-radius: var(--radius-lg);
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .error-message svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        flex-shrink: 0;
      }

      /* Loading skeleton */
      .loading-skeleton {
        background: linear-gradient(
          90deg,
          var(--bg) 25%,
          var(--border) 50%,
          var(--bg) 75%
        );
        background-size: 200% 100%;
        animation: skeleton 1.5s infinite;
        border-radius: var(--radius-md);
      }
      @keyframes skeleton {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Flatpickr theme overrides */
      .flatpickr-calendar {
        background: var(--card, #fff);
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        font-family: inherit;
      }
      .flatpickr-calendar.arrowTop::before,
      .flatpickr-calendar.arrowTop::after { display: none; }
      .flatpickr-months {
        padding: 8px 4px 0;
      }
      .flatpickr-months .flatpickr-month {
        background: transparent;
        color: var(--text-strong, #1a1a2e);
        fill: var(--text-strong, #1a1a2e);
        height: 36px;
      }
      .flatpickr-months .flatpickr-prev-month,
      .flatpickr-months .flatpickr-next-month {
        fill: var(--muted, #9ca3af);
        padding: 6px 10px;
      }
      .flatpickr-months .flatpickr-prev-month:hover,
      .flatpickr-months .flatpickr-next-month:hover {
        fill: var(--text, #374151);
      }
      .flatpickr-current-month {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-strong, #1a1a2e);
      }
      .flatpickr-current-month .flatpickr-monthDropdown-months {
        background: transparent;
        color: var(--text-strong, #1a1a2e);
        font-weight: 600;
      }
      .flatpickr-current-month input.cur-year {
        color: var(--text-strong, #1a1a2e);
        font-weight: 600;
      }
      span.flatpickr-weekday {
        background: transparent;
        color: var(--muted, #9ca3af);
        font-size: 12px;
        font-weight: 500;
      }
      .flatpickr-day {
        color: var(--text, #374151);
        border-radius: 8px;
        font-size: 13px;
        border: none;
        max-width: 36px;
        height: 36px;
        line-height: 36px;
      }
      .flatpickr-day:hover {
        background: var(--secondary, #f3f4f6);
        border: none;
      }
      .flatpickr-day.today {
        border: 1px solid var(--accent, #3b82f6);
        color: var(--accent, #3b82f6);
        font-weight: 600;
      }
      .flatpickr-day.today:hover {
        background: var(--accent, #3b82f6);
        color: #fff;
      }
      .flatpickr-day.selected {
        background: var(--accent, #3b82f6);
        color: #fff;
        border: none;
        font-weight: 600;
      }
      .flatpickr-day.selected:hover {
        background: var(--accent, #3b82f6);
        filter: brightness(1.1);
      }
      .flatpickr-day.flatpickr-disabled,
      .flatpickr-day.flatpickr-disabled:hover {
        color: var(--muted, #9ca3af);
        opacity: 0.4;
      }
      .flatpickr-day.prevMonthDay,
      .flatpickr-day.nextMonthDay {
        color: var(--muted, #9ca3af);
        opacity: 0.5;
      }
      .flatpickr-innerContainer {
        padding: 4px 8px 8px;
      }
    </style>

    <div class="analytics-layout">
      ${error
        ? html`
            <div class="error-message">${icons.alertCircle} ${error}</div>
          `
        : nothing}

      <div class="analytics-header">
        <div class="header-actions">
          <div class="period-selector">
            <button
              class="period-btn ${selectedPeriod === "1d" ? "active" : ""}"
              @click=${() => props.onPeriodChange?.("1d")}
            >
              Hôm nay
            </button>
            <button
              class="period-btn ${selectedPeriod === "7d" ? "active" : ""}"
              @click=${() => props.onPeriodChange?.("7d")}
            >
              7 ngày
            </button>
            <button
              class="period-btn ${selectedPeriod === "30d" ? "active" : ""}"
              @click=${() => props.onPeriodChange?.("30d")}
            >
              30 ngày
            </button>
            <button
              class="period-btn ${selectedPeriod === "90d" ? "active" : ""}"
              @click=${() => props.onPeriodChange?.("90d")}
            >
              90 ngày
            </button>
            <button
              class="period-btn ${selectedPeriod === "custom" ? "active" : ""}"
              @click=${() => props.onPeriodChange?.("custom")}
            >
              Tùy chỉnh
            </button>
          </div>
          ${selectedPeriod === "custom" ? html`
            <div class="date-range-picker">
              <input
                type="text"
                class="date-input fp-start"
                placeholder="Từ ngày"
                readonly
                @click=${(e: Event) => initDatePicker(e.target as HTMLElement, true)}
              />
              <span class="date-range-sep">→</span>
              <input
                type="text"
                class="date-input fp-end"
                placeholder="Đến ngày"
                readonly
                @click=${(e: Event) => initDatePicker(e.target as HTMLElement, false)}
              />
            </div>
          ` : nothing}
          <button class="refresh-btn" @click=${() => props.onRefresh?.()} title="Làm mới">
            ${icons.refresh}
          </button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card balance">
          <div class="stat-header">
            <div class="stat-icon">${icons.creditCard}</div>
          </div>
          <div class="stat-content">
            <span class="stat-label">Số dư hiện tại</span>
            <span class="stat-value" data-tooltip="${tokenBalance.toLocaleString("vi-VN")} tokens">${formatNumber(tokenBalance)}</span>
            <span class="stat-sub">tokens khả dụng</span>
          </div>
        </div>

        <div class="stat-card tokens">
          <div class="stat-header">
            <div class="stat-icon">${icons.zap}</div>
            ${tokenTrend
              ? html`
                  <div class="stat-trend ${tokenTrend.isUp ? "up" : "down"}">
                    ${tokenTrend.isUp ? icons.arrowUp : icons.chevronDown}
                    ${tokenTrend.value.toFixed(0)}%
                  </div>
                `
              : nothing}
          </div>
          <div class="stat-content">
            <span class="stat-label">Đã sử dụng</span>
            <span class="stat-value" data-tooltip="${(stats?.totalTokens ?? 0).toLocaleString("vi-VN")} tokens">${formatNumber(stats?.totalTokens ?? 0)}</span>
            <span class="stat-sub">tokens trong kỳ</span>
          </div>
        </div>

        <div class="stat-card requests">
          <div class="stat-header">
            <div class="stat-icon">${icons.messageSquare}</div>
            ${requestTrend
              ? html`
                  <div class="stat-trend ${requestTrend.isUp ? "up" : "down"}">
                    ${requestTrend.isUp ? icons.arrowUp : icons.chevronDown}
                    ${requestTrend.value.toFixed(0)}%
                  </div>
                `
              : nothing}
          </div>
          <div class="stat-content">
            <span class="stat-label">Tổng yêu cầu</span>
            <span class="stat-value" data-tooltip="${(stats?.totalRequests ?? 0).toLocaleString("vi-VN")} lượt">${formatNumber(stats?.totalRequests ?? 0)}</span>
            <span class="stat-sub">lượt gọi API</span>
          </div>
        </div>

        <div class="stat-card io">
          <div class="stat-header">
            <div class="stat-icon">${icons.arrowRight}</div>
          </div>
          <div class="stat-content">
            <span class="stat-label">Input / Output</span>
            <span class="stat-value" data-tooltip="${(stats?.inputTokens ?? 0).toLocaleString("vi-VN")} tokens">${formatNumber(stats?.inputTokens ?? 0)}</span>
            <span class="stat-sub">
              Output: <span data-tooltip="${(stats?.outputTokens ?? 0).toLocaleString("vi-VN")} tokens">${formatNumber(stats?.outputTokens ?? 0)}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="charts-row">
        <div class="a-card">
          <div class="a-card-header">
            <div>
              <div class="a-card-title">Sử dụng theo ngày</div>
              <div class="a-card-subtitle">Biểu đồ token sử dụng hàng ngày</div>
            </div>
          </div>
          <div class="a-card-body">
            ${loading
              ? html`<div class="loading-skeleton" style="height: 280px;"></div>`
              : renderAreaChart(dailyUsage, maxTokens)}
          </div>
        </div>

        <div class="a-card">
          <div class="a-card-header">
            <div>
              <div class="a-card-title">Phân bổ theo loại</div>
              <div class="a-card-subtitle">Chat, Workflow, API</div>
            </div>
          </div>
          <div class="a-card-body">
            ${loading
              ? html`<div class="loading-skeleton" style="height: 280px;"></div>`
              : renderDonutChart(typeUsage)}
          </div>
        </div>
      </div>
    </div>
  `;
}
