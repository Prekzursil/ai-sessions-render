/**
 * HTML renderer parity: the JS rail must reproduce the Python rail's HTML byte for
 * byte — including markdown-it output, link hardening, image defanging, the math
 * hold-out, and badge-vs-NCR placement.
 *
 * Regenerate with `python tools/gen-render-parity.py`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Conversation } from "../src/ir.js";
import { renderConversationHtml } from "../src/render_html.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/render-parity.json", import.meta.url)), "utf8"),
) as { cases: Array<{ ir: Conversation; md: string; html: string }> };

/** Point at the first divergence instead of dumping two 20 KB documents. */
function firstDiff(a: string, b: string): string {
  if (a === b) return "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at offset ${i}\n  js:  ...${a.slice(Math.max(0, i - 60), i + 90)}\n  py:  ...${b.slice(Math.max(0, i - 60), i + 90)}`;
}

describe("render_html python <-> js parity", () => {
  for (const [idx, c] of fixture.cases.entries()) {
    it(`case ${idx}: ${JSON.stringify(c.ir.title).slice(0, 40)}`, () => {
      const got = renderConversationHtml(c.ir);
      if (got !== c.html) throw new Error(firstDiff(got, c.html));
      expect(got).toBe(c.html);
    });
  }
});

describe("HTML security posture survives the port", () => {
  const byTitle = (t: string) => fixture.cases.find((x) => x.ir.title === t)!;

  it("ships a locked-down CSP and no scripts", () => {
    const html = renderConversationHtml(byTitle("plain").ir);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
  });

  it("escapes raw HTML in message bodies", () => {
    const html = renderConversationHtml(byTitle("math and html").ir);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves math verbatim rather than letting CommonMark mutate the TeX", () => {
    const html = renderConversationHtml(byTitle("math and html").ir);
    expect(html).toContain("\\times");
    expect(html).toContain("\\int_0^1");
    expect(html).not.toContain("zMaThSpAnZ"); // sentinel fully restored
  });

  it("defangs a remote markdown image instead of emitting a fetching <img>", () => {
    const c = byTitle("every block type");
    const html = renderConversationHtml(c.ir);
    expect(html).not.toContain('<img src="https://evil.example');
    expect(html).toContain("🖼");
  });

  it("badges hidden unicode in text but keeps legitimate emoji", () => {
    const html = renderConversationHtml(byTitle("hidden unicode a​b").ir);
    expect(html).toContain("cp-badge");
    expect(html).toContain('data-cp="U+200B"');
    expect(html).toContain("❤️");
  });

  it("never emits a live javascript: href", () => {
    const html = renderConversationHtml(byTitle("citations").ir);
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("unsafe");
  });
});
