import assert from "node:assert/strict";
import test from "node:test";

test("S07 characterized type-only canary has no runtime exports", async () => {
  const component =
    await import("../src/components/s07-characterized-canary.ts");

  assert.deepEqual(Object.keys(component), []);
});
