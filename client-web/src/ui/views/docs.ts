import { html } from "lit";
import { icons } from "../icons";

export interface DocsProps {}

const categories = [
  {
    title: "Windows",
    icon: "monitor",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    color: "#3b82f6",
    items: [
      { title: "Cài Đặt", description: "Hướng dẫn cài đặt trên Windows", icon: "rocket" },
      { title: "Cấu Hình", description: "Thiết lập và tùy chỉnh hệ thống", icon: "settings" },
      { title: "Khắc Phục Lỗi", description: "Các lỗi thường gặp và cách sửa", icon: "alertCircle" },
    ],
  },
  {
    title: "macOS",
    icon: "monitor",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    color: "#8b5cf6",
    items: [
      { title: "Cài Đặt", description: "Hướng dẫn cài đặt trên macOS", icon: "rocket" },
      { title: "Cấu Hình", description: "Thiết lập và tùy chỉnh hệ thống", icon: "settings" },
      { title: "Khắc Phục Lỗi", description: "Các lỗi thường gặp và cách sửa", icon: "alertCircle" },
    ],
  },
  {
    title: "Tài Liệu API",
    icon: "code",
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "#10b981",
    items: [
      { title: "Endpoints", description: "Danh sách đầy đủ các API endpoints", icon: "fileText" },
      { title: "Xác Thực", description: "Khóa API và tokens", icon: "lock" },
      { title: "Giới Hạn", description: "Hiểu về giới hạn sử dụng", icon: "barChart" },
    ],
  },
] as const;

export function renderDocs(_props: DocsProps) {
  return html`
    <style>
      .docs-layout {
        display: flex;
        flex-direction: column;
        gap: 28px;
      }

      /* Category Cards Grid */
      .docs-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 24px;
      }
      @media (max-width: 720px) {
        .docs-grid {
          grid-template-columns: 1fr;
        }
      }

      .docs-category {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, 16px);
        overflow: hidden;
        transition: all 0.2s ease;
      }
      .docs-category:hover {
        border-color: var(--border-strong, var(--border));
        box-shadow: 0 8px 24px -8px rgba(0,0,0,0.1);
      }

      .docs-category-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 24px 16px;
        position: relative;
      }
      .docs-category-header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 24px;
        right: 24px;
        height: 1px;
        background: var(--border);
      }
      .docs-category-icon {
        width: 42px;
        height: 42px;
        border-radius: var(--radius-lg, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: #fff;
      }
      .docs-category-icon svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .docs-category-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong);
      }

      .docs-items {
        padding: 8px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .docs-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 12px;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
        color: inherit;
      }
      .docs-item:hover {
        background: var(--secondary, var(--bg-hover));
      }
      .docs-item-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-md, 8px);
        background: var(--secondary, #f3f4f6);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.15s ease;
      }
      .docs-item:hover .docs-item-icon {
        background: var(--bg-hover, var(--secondary));
      }
      .docs-item-icon svg {
        width: 16px;
        height: 16px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 2;
      }
      .docs-item-content {
        flex: 1;
        min-width: 0;
      }
      .docs-item-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong);
        margin-bottom: 2px;
      }
      .docs-item-desc {
        font-size: 13px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .docs-item-arrow {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0;
        transform: translateX(-4px);
        transition: all 0.15s ease;
      }
      .docs-item-arrow svg {
        width: 16px;
        height: 16px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 2;
      }
      .docs-item:hover .docs-item-arrow {
        opacity: 1;
        transform: translateX(0);
      }

      /* Support Card */
      .docs-support {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, 16px);
        padding: 28px 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        position: relative;
        overflow: hidden;
      }
      .docs-support::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, var(--accent) 0%, #8b5cf6 50%, #f59e0b 100%);
      }
      @media (max-width: 600px) {
        .docs-support {
          flex-direction: column;
          align-items: flex-start;
          padding: 24px;
        }
      }

      .docs-support-info {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .docs-support-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-lg, 12px);
        background: var(--secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .docs-support-icon svg {
        width: 24px;
        height: 24px;
        stroke: var(--accent);
        fill: none;
        stroke-width: 2;
      }
      .docs-support-text h3 {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong);
        margin: 0 0 4px;
      }
      .docs-support-text p {
        font-size: 14px;
        color: var(--muted);
        margin: 0;
      }

      .docs-support-actions {
        display: flex;
        gap: 10px;
        flex-shrink: 0;
      }
      .docs-support-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        border-radius: var(--radius-md, 8px);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
        white-space: nowrap;
      }
      .docs-support-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .docs-support-btn.primary {
        background: var(--accent);
        color: #fff;
      }
      .docs-support-btn.primary:hover {
        filter: brightness(1.1);
      }
      .docs-support-btn.secondary {
        background: var(--secondary);
        color: var(--text);
        border: 1px solid var(--border);
      }
      .docs-support-btn.secondary:hover {
        background: var(--bg-hover, var(--secondary));
        border-color: var(--border-strong, var(--border));
      }
    </style>

    <div class="docs-layout">
      <div class="docs-grid">
        ${categories.map(
          (cat) => html`
            <div class="docs-category">
              <div class="docs-category-header">
                <div class="docs-category-icon" style="background: ${cat.gradient}">
                  ${(icons as any)[cat.icon]}
                </div>
                <div class="docs-category-title">${cat.title}</div>
              </div>
              <div class="docs-items">
                ${cat.items.map(
                  (item) => html`
                    <a href="#" class="docs-item" @click=${(e: Event) => e.preventDefault()}>
                      <div class="docs-item-icon">
                        ${(icons as any)[item.icon]}
                      </div>
                      <div class="docs-item-content">
                        <div class="docs-item-title">${item.title}</div>
                        <div class="docs-item-desc">${item.description}</div>
                      </div>
                      <div class="docs-item-arrow">${icons.chevronRight}</div>
                    </a>
                  `
                )}
              </div>
            </div>
          `
        )}
      </div>

      <div class="docs-support">
        <div class="docs-support-info">
          <div class="docs-support-icon">${icons.headphones}</div>
          <div class="docs-support-text">
            <h3>Cần Hỗ Trợ?</h3>
            <p>Không tìm thấy điều bạn cần? Liên hệ đội ngũ hỗ trợ.</p>
          </div>
        </div>
        <div class="docs-support-actions">
          <button class="docs-support-btn primary">
            ${icons.messageSquare} Liên Hệ
          </button>
          <button class="docs-support-btn secondary">
            ${icons.externalLink} Tài Liệu
          </button>
        </div>
      </div>
    </div>
  `;
}
