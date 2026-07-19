/**
 * Fidelity-gate and audit parity: the JS rail must produce the same prose-token
 * multiset, the same verify() verdict/coverage/missing list, and the same hidden-
 * char hit list as the Python rail.
 *
 * The subtle parity risks live here: Python's \w is Unicode-aware (WORD_RANGES),
 * html.unescape decodes all named entities (entities pkg), and sorting is by code
 * point, not UTF-16 unit.
 *
 * Regenerate with `python tools/gen-render-parity.py`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { hiddenCharHits } from "../src/audit.js";
import type { Conversation } from "../src/ir.js";
import { renderConversationHtml } from "../src/render_html.js";
import { proseTokens, verify } from "../src/verify.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/render-parity.json", import.meta.url)), "utf8"),
) as {
  cases: Array<{
    ir: Conversation;
    html: string;
    verify: { ok: boolean; missing_tokens: string[]; coverage: number };
    prose_tokens: string[];
    audit: string[];
  }>;
};

describe("verify + audit python <-> js parity", () => {
  for (const [idx, c] of fixture.cases.entries()) {
    describe(`case ${idx}: ${JSON.stringify(c.ir.title).slice(0, 36)}`, () => {
      it("prose token multiset matches", () => {
        expect([...proseTokens(c.ir)].sort()).toEqual([...c.prose_tokens].sort());
      });

      it("verify() over the Python-rendered HTML matches", () => {
        const v = verify(c.ir, c.html);
        expect(v.ok).toBe(c.verify.ok);
        expect(v.missing_tokens).toEqual(c.verify.missing_tokens);
        expect(v.coverage).toBeCloseTo(c.verify.coverage, 10);
      });

      it("verify() over the JS-rendered HTML also passes when Python's did", () => {
        // the byte-identical HTML is already proven elsewhere; this checks the gate
        // agrees on our own output, i.e. the port did not shift a token into a place
        // the tokenizer cannot see
        const v = verify(c.ir, renderConversationHtml(c.ir));
        expect(v.ok).toBe(c.verify.ok);
      });

      it("hidden-char audit hit list matches", () => {
        expect(hiddenCharHits(c.ir).sort()).toEqual([...c.audit].sort());
      });
    });
  }
});

describe("verify catches a real drop (negative control)", () => {
  it("flags a prose word missing from the HTML", () => {
    const conv = fixture.cases.find((x) => x.ir.title === "plain")!.ir;
    const broken = renderConversationHtml(conv).replace("hello", "");
    const v = verify(conv, broken);
    expect(v.ok).toBe(false);
    expect(v.missing_tokens).toContain("hello");
    expect(v.coverage).toBeLessThan(1);
  });
});
