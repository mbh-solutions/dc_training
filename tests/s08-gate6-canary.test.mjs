import assert from "node:assert/strict";
import test from "node:test";

test("S08 Gate 6 type-only canary has no runtime exports", async () => {
  const component = await import("../src/components/s08-gate6-canary.ts");

  assert.deepEqual(Object.keys(component), []);
});
