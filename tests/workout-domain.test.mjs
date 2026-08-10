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
    assignment_id: "assignment-1",
    body_part: "chest",
    duration_seconds: null,
    exercise: "Incline Smith Press",
    kind: "exercise",
    ordinal: 1,
    previous_duration_seconds: null,
    previous_reps: [],
    previous_weight_entries: [],
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
  assert.equal(guards.validWorkoutStep({ ...step, ordinal: 11 }), false);
  assert.equal(
    guards.validWorkoutStep({
      ...step,
      assignment_id: null,
      body_part: "calves",
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

test("every S04 entry structure has one exact save shape", () => {
  const matrix = [
    ["rest-pause", "rest_pause", [{ min: 11, max: 15 }], 1, 3, "reps"],
    ["single straight", "straight_set", [], 1, 1, "reps"],
    [
      "multiple straight",
      "straight_set",
      [
        { min: 6, max: 8 },
        { min: 10, max: 12 },
      ],
      2,
      2,
      "reps",
    ],
    [
      "widowmaker",
      "straight_set",
      [
        { min: 4, max: 6 },
        { min: 20, max: 20 },
      ],
      2,
      2,
      "reps",
    ],
    [
      "custom",
      "straight_set",
      [
        { min: 8, max: 10 },
        { min: 12, max: 15 },
        { min: 20, max: 20 },
      ],
      3,
      3,
      "reps",
    ],
    ["timed hold", "timed_hold", [], 1, 1, "seconds"],
  ];

  for (const [
    name,
    protocol,
    target_sets,
    weightCount,
    valueCount,
    metric,
  ] of matrix) {
    assert.deepEqual(
      guards.workoutEntryShape({ protocol, target_sets }),
      { metric, valueCount, weightCount },
      name,
    );
  }

  const timedHold = {
    assignment_id: "assignment-abs",
    body_part: "abs_2",
    duration_seconds: 60,
    exercise: "Front Plank",
    kind: "exercise",
    ordinal: 10,
    previous_duration_seconds: 45,
    previous_reps: [],
    previous_weight_entries: [
      { amount: "20", micrograms: "9071847400", unit: "lb" },
    ],
    protocol: "timed_hold",
    reps: [],
    status: "completed",
    step_id: "step-10",
    structure: "none",
    target_sets: [],
    weight_entries: [{ amount: "25", micrograms: "11339809250", unit: "lb" }],
    workout_id: "workout-1",
  };
  assert.equal(guards.validWorkoutStep(timedHold), true);
  assert.equal(
    guards.validWorkoutStep({ ...timedHold, duration_seconds: null }),
    false,
  );
});
