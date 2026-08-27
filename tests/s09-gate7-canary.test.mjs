import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const relativeCanary = existsSync(
  new URL("../src/components/s09-gate7-canary.ts", import.meta.url),
)
  ? "../src/components/s09-gate7-canary.ts"
  : "../legacy/s09-gate7-canary.ts";
const { S09_GATE7_CANARY } = await import(relativeCanary);

test("S09 Gate 7 component canary executes", () => {
  assert.equal(S09_GATE7_CANARY, "s09-gate7-quality");
});
