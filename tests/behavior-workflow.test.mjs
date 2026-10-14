import test from "node:test";
import assert from "node:assert/strict";
import { workflowCase } from "./behavior-workflow.mjs";
test("workout entries survive history correction and rotation editing", async () => {
  for (const [slot, amount, reps] of [
    ["A1", "80", [8, 3, 2]],
    ["A2", "100", [10, 3, 2]],
  ]) {
    assert.deepEqual(await workflowCase(slot, amount, reps), {
      slot,
      amount,
      recordedAmount: amount,
      recordedReps: reps,
      correctedReps: [reps[0] + 1, ...reps.slice(1)],
      exercise: "Incline barbell press",
      target: [{ min: reps[0], max: reps[0] + 4 }],
      comparison: "win",
    });
  }
});
