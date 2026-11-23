/**
 * Minimal, read-only Markdown renderer for the forAI panel.
 *
 * This is intentionally not a full CommonMark implementation. It supports the
 * subset the panel generates (headings, paragraphs, lists, fenced code, inline
 * code, links, bold/italic) and escapes all text before adding markup, so a
 * symbol name or docstring can never inject HTML. Keeping this local avoids a
 * large parser/sanitiser dependency in the webview bundle.
 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function safeHref(raw: string): string {
  const href = raw.trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("#") || href.startsWith("/")) return href;
  // Relative links are only useful for the graph's own symbol paths.
  if (!/^[a-z]+:/i.test(href)) return href;
  return "#";
}

function inline(value: string): string {
  let text = escapeHtml(value).replace(/\\([\\`*_[\]()#+.!-])/g, "$1");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) =>
      `<a href="${escapeHtml(safeHref(href))}">${label}</a>`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");
  return text;
}

/**
 * Render a Markdown string to safe HTML. The input is expected to come from
 * `ai-context.ts`, but all text is escaped regardless.
 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushCode = () => {
    html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```/);
    if (fence) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 1;
      html.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const item = line.match(/^\s*[-*+]\s+(.+)$/);
    if (item) {
      flushParagraph();
      list.push(item[1] ?? "");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote><p>${inline(quote[1] ?? "")}</p></blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (inCode) flushCode();
  return html.join("\n");
}
