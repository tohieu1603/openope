import DOMPurify from "dompurify";
import katex from "katex";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";

// Configure marked for safe inline rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub flavored markdown
});

// Configure DOMPurify: allow KaTeX + code copy buttons
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  // Allow onclick only on .gc-code-copy buttons (copy to clipboard)
  if (data.attrName === "onclick" && node.classList?.contains("gc-code-copy")) {
    data.forceKeepAttr = true;
  }
});

// --- LRU markdown cache (like TUI: 200 entries, skip >50k chars) ---
const MD_CACHE_MAX = 200;
const MD_CACHE_SKIP_CHARS = 50_000;
const mdCache = new Map<string, string>(); // insertion-order Map acts as LRU

function getCachedHtml(content: string): string | undefined {
  const hit = mdCache.get(content);
  if (hit !== undefined) {
    // Move to end (most-recently-used)
    mdCache.delete(content);
    mdCache.set(content, hit);
  }
  return hit;
}

function setCachedHtml(content: string, html: string) {
  if (content.length > MD_CACHE_SKIP_CHARS) return;
  if (mdCache.size >= MD_CACHE_MAX) {
    // Evict oldest (first inserted)
    const oldest = mdCache.keys().next().value;
    if (oldest !== undefined) mdCache.delete(oldest);
  }
  mdCache.set(content, html);
}

// Detect HTML error pages (Cloudflare, nginx, etc.) in content
function isHtmlErrorContent(text: string): boolean {
  return (
    /<!doctype|<html|<head>|cloudflare|cf-error|cf-wrapper/i.test(text) &&
    /<\/?(?:div|section|span|script|style|link|meta)\b/i.test(text)
  );
}

export function renderMarkdown(content: string): ReturnType<typeof unsafeHTML> {
  // Guard: detect HTML error pages leaked into chat content
  if (isHtmlErrorContent(content)) {
    const codeMatch = content.match(/Error\s*(?:code\s*)?(\d{3,4})/i);
    const code = codeMatch ? ` (${codeMatch[1]})` : "";
    return unsafeHTML(
      `<p style="color:var(--danger,#dc2626)">Gateway không khả dụng${code}. Vui lòng thử lại sau.</p>`,
    );
  }

  // Check LRU cache
  const cached = getCachedHtml(content);
  if (cached !== undefined) return unsafeHTML(cached);

  // 1. Extract math expressions before marked processing
  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  // Replace $$ ... $$ (block math)
  let processed = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const idx = mathBlocks.length;
    mathBlocks.push(expr.trim());
    return `\nMATHBLOCK${idx}ENDMATHBLOCK\n`;
  });

  // Replace $ ... $ (inline math) — skip $$ and escaped \$
  processed = processed.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_, expr) => {
    const idx = mathInlines.length;
    mathInlines.push(expr.trim());
    return `MATHINLINE${idx}ENDMATHINLINE`;
  });

  // 2. Run marked
  let htmlContent = marked.parse(processed, { async: false }) as string;

  // 3. Replace placeholders with KaTeX rendered HTML
  htmlContent = htmlContent.replace(/MATHBLOCK(\d+)ENDMATHBLOCK/g, (_, idx) => {
    try {
      return katex.renderToString(mathBlocks[parseInt(idx)], {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `$$${mathBlocks[parseInt(idx)]}$$`;
    }
  });

  htmlContent = htmlContent.replace(/MATHINLINE(\d+)ENDMATHINLINE/g, (_, idx) => {
    try {
      return katex.renderToString(mathInlines[parseInt(idx)], {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `$${mathInlines[parseInt(idx)]}$`;
    }
  });

  // 4. Wrap <table> in scrollable container
  htmlContent = htmlContent.replace(/<table/g, '<div class="gc-table-wrap"><table');
  htmlContent = htmlContent.replace(/<\/table>/g, "</table></div>");

  // 5. Wrap <pre> blocks with copy button (uses event delegation via onclick)
  const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  htmlContent = htmlContent.replace(
    /<pre>/g,
    `<div class="gc-code-wrap"><button class="gc-code-copy" title="Sao chép" onclick="var t=this.parentElement.querySelector('pre').textContent;navigator.clipboard.writeText(t).then(()=>{this.innerHTML='${checkSvg.replace(/'/g, "\\'")}';this.classList.add('gc-code-copy--done');setTimeout(()=>{this.innerHTML='${copySvg.replace(/'/g, "\\'")}';this.classList.remove('gc-code-copy--done')},1500)})">${copySvg}</button><pre>`,
  );
  htmlContent = htmlContent.replace(/<\/pre>/g, "</pre></div>");

  // 6. Sanitize HTML output — prevent XSS from AI responses
  const clean = DOMPurify.sanitize(htmlContent, {
    ADD_TAGS: ["button"],
    ADD_ATTR: ["onclick", "title"],
    ADD_DATA_URI_TAGS: ["img"],
    ALLOW_ARIA_ATTR: true,
  });

  // Store in LRU cache
  setCachedHtml(content, clean);

  return unsafeHTML(clean);
}
