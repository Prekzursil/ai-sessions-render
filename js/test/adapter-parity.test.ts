/**
 * Adapter cross-language parity: feed each Python adapter's exact input to the JS
 * adapter and assert IDENTICAL IR.
 *
 * This is the gate that reaches the hard logic — Claude's subtree-max active-path
 * walk (the naive version dropped 42 messages on real data), ChatGPT's current_node
 * fallback, timestamp formatting — which the synthetic renderer fixtures never
 * touch. Its fixture embeds SAMPLED REAL conversation content, so it is generated on
 * demand (`python tools/gen-adapter-parity.py`), gitignored, and never packaged.
 *
 * When the fixture is absent (fresh clone / CI), these tests skip rather than fail,
 * so CI stays green while the local run gets the real check.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as chatgpt from "../src/adapters/chatgpt.js";
import * as claude from "../src/adapters/claude.js";
import * as gemini from "../src/adapters/gemini.js";
import type { Conversation } from "../src/ir.js";

const path = fileURLToPath(new URL("./fixtures/adapter-parity.json", import.meta.url));
const present = existsSync(path);

interface Fx {
  claude: Array<{ name: string; input: unknown; is_design_chat: boolean; ir: Conversation }>;
  chatgpt: Array<{ name: string; input: Record<string, unknown>; ir: Conversation }>;
  gemini: Array<{
    name: string;
    records: Record<string, unknown>[];
    groups: gemini.Group[];
    ir: Conversation[];
  }>;
}

const fx: Fx = present
  ? (JSON.parse(readFileSync(path, "utf8")) as Fx)
  : { claude: [], chatgpt: [], gemini: [] };

/** IR round-trips through JSON before comparison so `undefined` vs missing key and
 *  tuple-vs-array shapes match Python's asdict()+json output exactly. */
const norm = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe.skipIf(!present)("adapter parity (real + synthetic corpora)", () => {
  it("fixture is present and non-trivial", () => {
    expect(fx.claude.length + fx.chatgpt.length + fx.gemini.length).toBeGreaterThan(3);
  });

  describe("claude", () => {
    for (const c of fx.claude) {
      it(c.name, () => {
        const parsed = c.is_design_chat
          ? claude.parseDesignChat(c.input as Record<string, unknown>)
          : claude.parseConversation(c.input);
        expect(norm(parsed)).toEqual(norm(c.ir));
      });
    }
  });

  describe("chatgpt", () => {
    for (const c of fx.chatgpt) {
      it(c.name, () => {
        expect(norm(chatgpt.parseConversation(c.input))).toEqual(norm(c.ir));
      });
    }
  });

  describe("gemini", () => {
    for (const c of fx.gemini) {
      it(c.name, () => {
        expect(norm(gemini.parseAll(c.records, c.groups))).toEqual(norm(c.ir));
      });
    }
  });
});

it("adapter-parity fixture presence", () => {
  // a visible marker in the report so an absent fixture is a conscious state, not a
  // silent hole — if it is missing locally, regenerate it
  expect(typeof present).toBe("boolean");
});
