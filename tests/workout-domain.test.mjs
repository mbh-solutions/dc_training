import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function load(source) {
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(javascript)}`);
}

const conversion = await load(
  readFileSync(new URL("../src/weight-conversion.ts", import.meta.url), "utf8"),
);
const guards = await load(
  readFileSync(new URL("../src/workout-domain.ts", import.meta.url), "utf8")
    .replace(
      'import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";',
      'const WORKOUT_SLOTS = ["A1", "B1", "A2", "B2", "A3", "B3"];',
    )
    .replace('import type { WeightEntry } from "./weight-conversion.js";', ""),
);

test("weights keep exact canonical micrograms and comparison-safe previews", () => {
  assert.equal(
    conversion.weightMicrograms({ amount: "1", unit: "lb" }),
    453592370n,
  );
  assert.equal(
    conversion.weightMicrograms({ amount: "1", unit: "kg" }),
    1000000000n,
  );
  assert.equal(
    conversion.conversionPreview({ amount: "100.5", unit: "lb" }),
    "≈ 45.5 kg",
  );
  assert.equal(
    conversion.conversionPreview({ amount: "45.5", unit: "kg" }),
    "≈ 100.5 lb",
  );
  assert.equal(
    conversion.weightMicrograms({ amount: "100.25", unit: "lb" }),
    null,
  );
  assert.equal(
    conversion.weightMicrograms({ amount: "45.1", unit: "kg" }),
    null,
  );
});

test("workout rows fail closed at the API boundary", () => {
  const workout = {
    completed_at: null,
    slot: "A1",
    status: "in_progress",
    workout_id: "workout-1",
  };
  const step = {
    body_part: "chest",
    exercise: "Incline Smith Press",
    kind: "exercise",
    ordinal: 1,
    protocol: "rest_pause",
    reps: [],
    status: "pending",
    step_id: "step-1",
    structure: "11-15 RP",
    target_sets: [{ min: 11, max: 15 }],
    weight_entries: [],
    workout_id: "workout-1",
  };

  assert.equal(guards.validWorkout(workout), true);
  assert.equal(guards.validWorkout({ ...workout, slot: "Z9" }), false);
  assert.equal(
    guards.validWorkout({ ...workout, completed_at: "2026-08-09" }),
    false,
  );
  assert.equal(guards.validWorkoutStep(step), true);
  assert.equal(
    guards.validWorkoutStep({
      ...step,
      body_part: "hamstrings",
      exercise: null,
      kind: "stretch",
      protocol: null,
      structure: null,
      target_sets: [],
    }),
    false,
  );
  assert.equal(
    guards.validWorkoutStep({ ...step, target_sets: [{ min: 15, max: 11 }] }),
    false,
  );
});
