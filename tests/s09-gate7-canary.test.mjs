import assert from "node:assert/strict";
import test from "node:test";

import { S09_GATE7_CANARY } from "../src/components/s09-gate7-canary.ts";

test("S09 Gate 7 component canary executes", () => {
  assert.equal(S09_GATE7_CANARY, "s09-gate7-quality");
});
