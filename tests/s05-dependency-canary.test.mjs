import assert from "node:assert/strict";
import test from "node:test";

test("S05 type-only canary has no runtime exports", async () => {
  const [application, domain] = await Promise.all([
    import("../src/application/s05-canary.ts"),
    import("../src/domain/s05-canary.ts"),
  ]);

  assert.deepEqual(Object.keys(application), []);
  assert.deepEqual(Object.keys(domain), []);
});
