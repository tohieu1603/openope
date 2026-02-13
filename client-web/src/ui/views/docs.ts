import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { icons } from "../icons";
import { getDocArticle, type DocArticle } from "../doc-content";

export interface DocsProps {
  selectedSlug: string | null;
  onSelectDoc: (slug: string) => void;
  onBack: () => void;
}

const categories = [
  {
    title: "Giới Thiệu",
    icon: "rocket",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    color: "#3b82f6",
    items: [
      { title: "Bắt Đầu Nhanh", description: "Hướng dẫn cài đặt và sử dụng cơ bản", icon: "zap", slug: "bat-dau-nhanh" },
      { title: "Tổng Quan Hệ Thống", description: "Kiến trúc và cách hoạt động", icon: "cpu", slug: "tong-quan-he-thong" },
    ],
  },
  {
    title: "Khả Năng Cơ Bản",
    icon: "sparkles",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    color: "#8b5cf6",
    items: [
      { title: "Chat và Hỏi Đáp", description: "Gửi tin nhắn và nhận phản hồi AI", icon: "messageSquare", slug: "chat-va-hoi-dap" },
      { title: "Kiểm Tra Máy Tính", description: "Giám sát tình trạng hệ thống", icon: "monitor", slug: "kiem-tra-may-tinh" },
      { title: "Quản Lý File", description: "Thao tác file và thư mục", icon: "folder", slug: "quan-ly-file" },
      { title: "Tìm Kiếm Web", description: "Tìm kiếm thông tin trên internet", icon: "search", slug: "tim-kiem-web" },
    ],
  },
  {
    title: "Trình Duyệt Web",
    icon: "monitor",
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "#10b981",
    items: [
      { title: "Tổng Quan Trình Duyệt", description: "Giới thiệu tính năng trình duyệt", icon: "book", slug: "tong-quan-trinh-duyet" },
      { title: "Chrome Extension", description: "Cài đặt và sử dụng extension", icon: "puzzle", slug: "chrome-extension" },
      { title: "Điều Khiển Trình Duyệt", description: "Tự động hóa thao tác trình duyệt", icon: "code", slug: "dieu-khien-trinh-duyet" },
      { title: "Ví Dụ Thực Tế", description: "Các ví dụ sử dụng trình duyệt", icon: "fileText", slug: "vi-du-trinh-duyet" },
    ],
  },
  {
    title: "Tự Động Hóa",
    icon: "workflow",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    color: "#f59e0b",
    items: [
      { title: "Hẹn Giờ và Nhắc Nhở", description: "Đặt lịch và nhắc nhở tự động", icon: "clock", slug: "hen-gio-va-nhac-nho" },
      { title: "Kiểm Tra Định Kỳ", description: "Tự động kiểm tra theo lịch", icon: "calendar", slug: "kiem-tra-dinh-ky" },
      { title: "Làm Việc Lớn Ở Nền", description: "Chạy tác vụ nặng nền tảng", icon: "cpu", slug: "lam-viec-lon-o-nen" },
      { title: "Ví Dụ Thực Tế", description: "Các ví dụ tự động hóa", icon: "fileText", slug: "vi-du-tu-dong-hoa" },
    ],
  },
] as const;

/** Find category + item info for a given slug */
function findItemMeta(slug: string) {
  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.slug === slug) return { category: cat, item };
    }
  }
  return null;
}

/** TOC entry extracted from article HTML */
interface TocEntry {
  id: string;
  text: string;
  level: number; // 1, 2, or 3
}

/** Slugify Vietnamese text for heading IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Parse headings from HTML, inject IDs, return { html, toc }.
 * Handles h1, h2, h3. Deduplicates IDs with suffix.
 */
function parseArticleHtml(rawHtml: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const usedIds = new Set<string>();

  const processed = rawHtml.replace(/<(h[12])>(.*?)<\/\1>/gi, (_match, tag: string, content: string) => {
    const level = parseInt(tag[1], 10);
    // Strip inner HTML tags to get plain text
    const text = content.replace(/<[^>]*>/g, "").trim();
    let id = slugify(text);
    // Deduplicate
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    usedIds.add(id);
    toc.push({ id, text, level });
    return `<${tag} id="${id}">${content}</${tag}>`;
  });

  return { html: processed, toc };
}

/** Render article detail view */
function renderArticle(article: DocArticle, props: DocsProps) {
  const meta = findItemMeta(article.slug);
  const catItems = meta ? meta.category.items : [];
  const currentIdx = catItems.findIndex((i) => i.slug === article.slug);
  const catColor = meta?.category.color ?? "var(--accent)";

  // Next/prev within same category
  const prev = currentIdx > 0 ? catItems[currentIdx - 1] : null;
  const next = currentIdx < catItems.length - 1 ? catItems[currentIdx + 1] : null;

  // Parse headings for TOC + inject IDs
  const { html: articleHtml, toc } = parseArticleHtml(article.html);

  // Sidebar: all items in current category for quick jump
  const sidebarItems = meta ? meta.category.items : [];

  return html`
    <style>
      .doc-detail {
        display: flex;
        flex-direction: column;
        gap: 0;
        animation: docFadeIn 0.25s ease-out;
      }
      @keyframes docFadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Breadcrumb bar */
      .doc-breadcrumb {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 0 20px;
        font-size: 13px;
        color: var(--muted);
        flex-wrap: wrap;
      }
      .doc-breadcrumb-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: var(--radius-md, 8px);
        background: var(--secondary, #f3f4f6);
        border: 1px solid var(--border);
        color: var(--text);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: inherit;
      }
      .doc-breadcrumb-back:hover {
        background: var(--bg-hover, var(--secondary));
        border-color: var(--border-strong, var(--border));
      }
      .doc-breadcrumb-back svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .doc-breadcrumb-sep {
        color: var(--muted);
        opacity: 0.4;
      }
      .doc-breadcrumb-cat {
        color: var(--muted);
      }
      .doc-breadcrumb-current {
        color: var(--text-strong);
        font-weight: 500;
      }

      /* Two-column layout: main + sidebar */
      .doc-columns {
        display: grid;
        grid-template-columns: 1fr 240px;
        gap: 24px;
        align-items: start;
      }
      @media (max-width: 900px) {
        .doc-columns {
          grid-template-columns: 1fr;
        }
        .doc-sidebar { display: none; }
      }

      /* Sidebar */
      .doc-sidebar {
        position: sticky;
        top: 24px;
      }
      .doc-sidebar-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 12px);
        overflow: hidden;
      }
      .doc-sidebar-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
        padding: 16px 16px 8px;
      }
      .doc-sidebar-items {
        padding: 0 8px 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .doc-sidebar-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all 0.12s ease;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-family: inherit;
        font-size: 13px;
        color: var(--text);
      }
      .doc-sidebar-item:hover {
        background: var(--secondary, var(--bg-hover));
      }
      .doc-sidebar-item.active {
        background: var(--secondary, var(--bg-hover));
        font-weight: 600;
        color: var(--text-strong);
      }
      .doc-sidebar-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        opacity: 0.35;
        transition: all 0.12s ease;
      }
      .doc-sidebar-item.active .doc-sidebar-dot {
        opacity: 1;
        transform: scale(1.3);
      }

      /* TOC indentation levels */
      a.doc-sidebar-item {
        text-decoration: none;
        color: var(--text);
      }
      a.doc-sidebar-item:hover {
        color: var(--text-strong);
      }
      .doc-toc-1 {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-strong);
      }
      .doc-toc-2 {
        padding-left: 22px;
        font-size: 14px;
      }
      .doc-toc-2 .doc-sidebar-dot {
        width: 5px;
        height: 5px;
      }
      /* Article card */
      .doc-article {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, 16px);
        overflow: hidden;
        position: relative;
      }
      /* Top accent bar */
      .doc-article::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
      }
      .doc-article-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 28px 36px 24px;
        border-bottom: 1px solid var(--border);
      }
      @media (max-width: 600px) {
        .doc-article-header { padding: 20px 20px 16px; }
      }
      .doc-article-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-lg, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: #fff;
      }
      .doc-article-icon svg {
        width: 22px;
        height: 22px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .doc-article-header-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .doc-article-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-strong);
        letter-spacing: -0.01em;
      }
      .doc-article-subtitle {
        font-size: 13px;
        color: var(--muted);
      }

      /* ── Article body — premium doc styling ── */
      .doc-article-body {
        padding: 32px 36px 40px;
        font-size: 15px;
        line-height: 1.75;
        color: var(--text);
        max-width: 100%;
      }
      @media (max-width: 600px) {
        .doc-article-body { padding: 20px; }
      }

      /* H1 — section divider with accent left border */
      .doc-article-body h1 {
        font-size: 21px;
        font-weight: 700;
        color: var(--text-strong);
        margin: 40px 0 18px;
        padding: 0 0 0 16px;
        border-left: 3px solid var(--doc-accent, var(--accent));
        line-height: 1.35;
      }
      .doc-article-body h1:first-child {
        margin-top: 0;
      }

      /* H2 — with subtle background chip */
      .doc-article-body h2 {
        font-size: 17px;
        font-weight: 600;
        color: var(--text-strong);
        margin: 32px 0 14px;
        padding: 8px 14px;
        background: var(--secondary, rgba(0,0,0,0.03));
        border-radius: var(--radius-md, 8px);
        display: inline-block;
        line-height: 1.4;
      }

      /* H3 — with colored dot */
      .doc-article-body h3 {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-strong);
        margin: 24px 0 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        line-height: 1.4;
      }
      .doc-article-body h3::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--doc-accent, var(--accent));
        flex-shrink: 0;
        opacity: 0.7;
      }

      /* Paragraphs */
      .doc-article-body p {
        margin: 0 0 16px;
      }

      /* Lists — custom colored bullets */
      .doc-article-body ul {
        margin: 0 0 20px;
        padding-left: 0;
        list-style: none;
      }
      .doc-article-body li {
        position: relative;
        padding-left: 24px;
        margin-bottom: 10px;
        line-height: 1.65;
      }
      .doc-article-body li::before {
        content: '';
        position: absolute;
        left: 6px;
        top: 10px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--doc-accent, var(--accent));
        opacity: 0.5;
      }

      /* Strong — subtle highlight */
      .doc-article-body strong {
        color: var(--text-strong);
        font-weight: 600;
      }

      /* Emphasis */
      .doc-article-body em {
        color: var(--muted);
        font-style: italic;
      }

      /* Prev/Next navigation */
      .doc-nav {
        display: flex;
        gap: 16px;
        margin-top: 24px;
      }
      @media (max-width: 600px) {
        .doc-nav { flex-direction: column; }
      }
      .doc-nav-btn {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 22px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
        color: inherit;
        font-family: inherit;
      }
      .doc-nav-btn:hover {
        border-color: var(--border-strong, var(--border));
        box-shadow: 0 4px 16px -4px rgba(0,0,0,0.1);
        transform: translateY(-1px);
      }
      .doc-nav-btn.prev { justify-content: flex-start; }
      .doc-nav-btn.next { justify-content: flex-end; text-align: right; }
      .doc-nav-btn svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke-width: 2;
        flex-shrink: 0;
      }
      .doc-nav-btn.prev svg { stroke: var(--muted); }
      .doc-nav-btn.next svg { stroke: var(--doc-accent, var(--accent)); }
      .doc-nav-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted);
        margin-bottom: 4px;
      }
      .doc-nav-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong);
      }
    </style>

    <div class="doc-detail" style="--doc-accent: ${catColor}">
      <div class="doc-breadcrumb">
        <button class="doc-breadcrumb-back" @click=${props.onBack}>
          ${icons.chevronLeft} Tài Liệu
        </button>
        ${meta
          ? html`
              <span class="doc-breadcrumb-sep">/</span>
              <span class="doc-breadcrumb-cat">${meta.category.title}</span>
              <span class="doc-breadcrumb-sep">/</span>
              <span class="doc-breadcrumb-current">${article.title}</span>
            `
          : nothing}
      </div>

      <div class="doc-columns">
        <div>
          <div class="doc-article" style="--doc-accent: ${catColor}">
            ${meta
              ? html`
                  <div class="doc-article-header">
                    <div class="doc-article-icon" style="background: ${meta.category.gradient}">
                      ${(icons as any)[meta.item.icon]}
                    </div>
                    <div class="doc-article-header-text">
                      <div class="doc-article-title">${article.title}</div>
                      <div class="doc-article-subtitle">${meta.category.title} &middot; ${meta.item.description}</div>
                    </div>
                  </div>
                `
              : nothing}
            <div class="doc-article-body" style="--doc-accent: ${catColor}">
              ${unsafeHTML(articleHtml)}
            </div>
          </div>

          ${prev || next
            ? html`
                <div class="doc-nav">
                  ${prev
                    ? html`
                        <button class="doc-nav-btn prev" @click=${() => props.onSelectDoc(prev.slug)}>
                          ${icons.chevronLeft}
                          <div>
                            <div class="doc-nav-label">Trước</div>
                            <div class="doc-nav-title">${prev.title}</div>
                          </div>
                        </button>
                      `
                    : html`<div style="flex:1"></div>`}
                  ${next
                    ? html`
                        <button class="doc-nav-btn next" @click=${() => props.onSelectDoc(next.slug)}>
                          <div>
                            <div class="doc-nav-label">Tiếp theo</div>
                            <div class="doc-nav-title">${next.title}</div>
                          </div>
                          ${icons.chevronRight}
                        </button>
                      `
                    : html`<div style="flex:1"></div>`}
                </div>
              `
            : nothing}
        </div>

        <!-- Sidebar: TOC + category nav -->
        <aside class="doc-sidebar">
          ${toc.length > 0
            ? html`
                <div class="doc-sidebar-card">
                  <div class="doc-sidebar-title">Mục lục</div>
                  <div class="doc-sidebar-items">
                    ${toc.map(
                      (entry) => html`
                        <a
                          class="doc-sidebar-item doc-toc-${entry.level}"
                          href="#${entry.id}"
                          @click=${(e: Event) => {
                            e.preventDefault();
                            const el = document.getElementById(entry.id);
                            if (el) {
                              const scroller = el.closest(".content") as HTMLElement | null;
                              if (scroller) {
                                const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 20;
                                scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
                              } else {
                                el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }
                          }}
                        >
                          <span class="doc-sidebar-dot" style="background: ${catColor}"></span>
                          ${entry.text}
                        </a>
                      `
                    )}
                  </div>
                </div>
              `
            : nothing}

          <div class="doc-sidebar-card" style="margin-top: 12px">
            <div class="doc-sidebar-title">${meta?.category.title ?? "Bài viết"}</div>
            <div class="doc-sidebar-items">
              ${sidebarItems.map(
                (si) => html`
                  <button
                    class="doc-sidebar-item ${si.slug === article.slug ? "active" : ""}"
                    @click=${() => props.onSelectDoc(si.slug)}
                  >
                    <span class="doc-sidebar-dot" style="background: ${catColor}"></span>
                    ${si.title}
                  </button>
                `
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

export function renderDocs(props: DocsProps) {
  // Detail view
  if (props.selectedSlug) {
    const article = getDocArticle(props.selectedSlug);
    if (article) return renderArticle(article, props);
  }

  // List view (categories grid)
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
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-family: inherit;
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
                    <button class="docs-item" @click=${() => props.onSelectDoc(item.slug)}>
                      <div class="docs-item-icon">
                        ${(icons as any)[item.icon]}
                      </div>
                      <div class="docs-item-content">
                        <div class="docs-item-title">${item.title}</div>
                        <div class="docs-item-desc">${item.description}</div>
                      </div>
                      <div class="docs-item-arrow">${icons.chevronRight}</div>
                    </button>
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
