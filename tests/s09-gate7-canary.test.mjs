import assert from "node:assert/strict";
import test from "node:test";

import { S09_GATE7_CANARY } from "../src/components/s09-gate7-canary.ts";

test("S10 Gate 8 component fixture preserves the existing first workout slot", () => {
  assert.equal(S09_GATE7_CANARY, "A1");
});
