/**
 * Markdown renderer parity: the JS rail must reproduce the Python rail's Markdown
 * byte for byte, including the injection hardening (a title cannot forge a turn
 * header; a citation title/URL cannot forge a second live link).
 *
 * Regenerate with `python tools/gen-render-parity.py`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Conversation } from "../src/ir.js";
import { renderConversationMd } from "../src/render_md.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/render-parity.json", import.meta.url)), "utf8"),
) as { cases: Array<{ ir: Conversation; md: string; html: string }> };

describe("render_md python <-> js parity", () => {
  it("covers the battery", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const [idx, c] of fixture.cases.entries()) {
    it(`case ${idx}: ${JSON.stringify(c.ir.title).slice(0, 40)}`, () => {
      expect(renderConversationMd(c.ir)).toBe(c.md);
    });
  }
});

describe("markdown injection hardening survives the port", () => {
  const forged = (md: string): string[] =>
    md.split("\n").filter((ln) => ln.trimStart().startsWith("## Human"));

  it("a conversation title cannot forge an extra turn header", () => {
    const c = fixture.cases.find((x) => x.ir.title.includes("INJECTED"));
    expect(c).toBeDefined();
    const md = renderConversationMd(c!.ir);
    expect(forged(md).length).toBe(1); // only the ONE real human turn
    expect(md).toContain("INJECTED"); // content kept, just made inert
  });

  it("a citation title/url cannot forge a live javascript link", () => {
    const c = fixture.cases.find((x) => x.ir.title === "citations");
    expect(c).toBeDefined();
    const md = renderConversationMd(c!.ir);
    expect(/(?<!\\)\]\(javascript:/.test(md)).toBe(false);
  });

  it("a tool name cannot break its code span or forge a turn", () => {
    const c = fixture.cases.find((x) => x.ir.title === "tool name breakout");
    expect(c).toBeDefined();
    expect(forged(renderConversationMd(c!.ir)).length).toBe(0);
  });

  it("remote media is defanged, local media stays an image link", () => {
    const c = fixture.cases.find((x) => x.ir.title === "every block type");
    const md = renderConversationMd(c!.ir);
    expect(md).toContain("remote media");
    expect(md).not.toContain("![https://evil.example");
    expect(md).toContain("../media/shot.png");
  });

  it("hidden unicode is stripped, not badged, in the portable copy", () => {
    const c = fixture.cases.find((x) => x.ir.title.startsWith("hidden unicode"));
    const md = renderConversationMd(c!.ir);
    expect(md).not.toContain("​");
    expect(md).not.toContain("‮");
    expect(md).not.toContain("cp-badge");
    expect(md).toContain("❤️"); // legitimate emoji survives
  });
});
