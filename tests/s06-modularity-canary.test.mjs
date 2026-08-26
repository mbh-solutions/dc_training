import assert from "node:assert/strict";
import test from "node:test";

test("S06 type-only canary has no runtime exports", async () => {
  const component = await import("../src/components/s06-canary.ts");

  assert.deepEqual(Object.keys(component), []);
});
