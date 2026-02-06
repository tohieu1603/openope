import { html } from "lit";
import { icons } from "../icons";

export interface DocsProps {}

export function renderDocs(_props: DocsProps) {
  const categories = [
    {
      title: "Bắt Đầu",
      items: [
        { title: "Giới Thiệu", description: "Tìm hiểu cơ bản về Operis" },
        { title: "Hướng Dẫn Nhanh", description: "Bắt đầu sử dụng trong vài phút" },
        { title: "Xác Thực", description: "Cách xác thực với API" },
      ],
    },
    {
      title: "Tính Năng",
      items: [
        { title: "Chat API", description: "Gửi tin nhắn và nhận phản hồi" },
        { title: "Workflows", description: "Tự động hóa tác vụ với workflows" },
        { title: "Tích Hợp", description: "Kết nối với dịch vụ bên thứ ba" },
      ],
    },
    {
      title: "Tài Liệu API",
      items: [
        { title: "Endpoints", description: "Danh sách đầy đủ các API endpoints" },
        { title: "Xác Thực", description: "Khóa API và tokens" },
        { title: "Giới Hạn", description: "Hiểu về giới hạn sử dụng" },
      ],
    },
  ];

  return html`
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
      ${categories.map(
        (category) => html`
          <div class="card">
            <div class="card-title" style="margin-bottom: 16px;">${category.title}</div>
            <div class="list">
              ${category.items.map(
                (item) => html`
                  <a href="#" class="list-item" style="text-decoration: none; color: inherit;" @click=${(e: Event) => e.preventDefault()}>
                    <div class="list-item-icon">${icons.book}</div>
                    <div class="list-item-content">
                      <div class="list-item-title">${item.title}</div>
                      <div class="list-item-description">${item.description}</div>
                    </div>
                  </a>
                `
              )}
            </div>
          </div>
        `
      )}
    </div>

    <div class="card" style="margin-top: 24px;">
      <div class="card-header">
        <div>
          <div class="card-title">Cần Hỗ Trợ?</div>
          <div class="card-description">Không tìm thấy điều bạn cần?</div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-secondary">
          <span style="display: flex; align-items: center; gap: 6px;">
            ${icons.messageSquare}
            Liên Hệ Hỗ Trợ
          </span>
        </button>
        <button class="btn btn-ghost">
          <span style="display: flex; align-items: center; gap: 6px;">
            ${icons.book}
            Xem Tài Liệu Đầy Đủ
          </span>
        </button>
      </div>
    </div>
  `;
}
