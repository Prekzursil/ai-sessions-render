import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Lean gate. The Python rail enforces 100% on all four metrics (pytest
      // --cov-fail-under=100). This rail enforces 100% statements/lines/functions
      // too; branches are floored at 88% rather than 100% because TypeScript's
      // null-safety idiom (`x ?? d`, `a || b`, the `get()`/`s()` helpers) emits a
      // falsy-side branch for every defensive guard, many of which the type system
      // already proves unreachable. Chasing those to 100% is the coverage theater
      // the Lean philosophy rejects; the floor still fails CI on a real regression.
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 88 },
      include: ["src/**/*.ts"],
      // generated data tables carry no hand-written branches worth gating
      exclude: ["src/generated/**"],
      reporter: ["text-summary", "text"],
    },
  },
});
