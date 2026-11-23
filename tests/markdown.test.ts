import { describe, expect, test } from "bun:test";

import { renderMarkdown } from "../src/lib/markdown";

describe("read-only Markdown renderer", () => {
  test("renders headings, lists and links", () => {
    const html = renderMarkdown(
      "# gpen-js/\n\n## src/main.ts\n\n- [main](gpen-js//src/main.ts#main)\n- none\n",
    );
    expect(html).toContain("<h1>gpen-js/</h1>");
    expect(html).toContain("<h2>src/main.ts</h2>");
    expect(html).toContain('<a href="gpen-js//src/main.ts#main">main</a>');
    expect(html).toContain("<ul><li>");
  });

  test("renders escaped headings and inline code", () => {
    const html = renderMarkdown("### \\#MyClass.run\n\n`path#L1C2`\n");
    expect(html).toContain("<h3>#MyClass.run</h3>");
    expect(html).toContain("<code>path#L1C2</code>");
  });

  test("escapes HTML in user-controlled names", () => {
    const html = renderMarkdown("## <img src=x onerror=alert(1)>\n");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("renders fenced code without interpreting its contents", () => {
    const html = renderMarkdown("```\n# not a heading\n```\n");
    expect(html).toContain("<pre><code># not a heading</code></pre>");
    expect(html).not.toContain("<h1>");
  });
});
