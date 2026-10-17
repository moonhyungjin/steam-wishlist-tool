import { defineConfig } from "vitest/config";

// Separate from the root config on purpose: this hits Steam and the real Upstash, so `npm test`
// and CI must never pick it up. Run it by hand - see docs/genre-taste-eval.md.
export default defineConfig({
  test: { include: ["tools/taste-eval/*.test.ts"], environment: "node", testTimeout: 600_000 },
});
