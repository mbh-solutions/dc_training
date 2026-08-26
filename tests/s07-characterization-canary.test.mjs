import assert from "node:assert/strict";
import test from "node:test";

test("S07 type-only canaries have no runtime exports", async () => {
  const characterized =
    await import("../src/components/s07-characterized-canary.ts");
  const uncovered = await import("../src/components/s07-uncovered-canary.ts");

  assert.deepEqual(Object.keys(characterized), []);
  assert.deepEqual(Object.keys(uncovered), []);
});
