import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/workout-domain.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";',
    'const WORKOUT_SLOTS = ["A1", "B1", "A2", "B2", "A3", "B3"];',
  )
  .replace('import type { WeightEntry } from "./weight-conversion.js";', "");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const domain = await import(
  `data:text/javascript,${encodeURIComponent(javascript)}`
);

const assignment = (overrides) => ({
  active: true,
  assignment_id: "assignment",
  body_part: "chest",
  created_at: "2026-08-01T12:00:00Z",
  exercise: "Incline barbell press",
  protocol: "rest_pause",
  slot: "A1",
  structure: "11-15",
  target_sets: [{ min: 11, max: 15 }],
  ...overrides,
});

test("S06 history ordering and correction boundary stay deterministic", () => {
  const assignments = [
    assignment({ assignment_id: "chest-a3", slot: "A3" }),
    assignment({
      assignment_id: "shoulders-a2",
      body_part: "shoulders",
      slot: "A2",
    }),
    assignment({ assignment_id: "chest-a1" }),
    assignment({
      assignment_id: "biceps-b1",
      body_part: "biceps",
      slot: "B1",
    }),
    assignment({
      assignment_id: "back-width-a1",
      body_part: "back_width",
    }),
    assignment({
      active: false,
      assignment_id: "old-current",
      created_at: "2026-07-01T12:00:00Z",
      slot: "A1",
    }),
    assignment({
      active: false,
      assignment_id: "same-exercise-other-slot",
      created_at: "2026-07-01T12:00:00Z",
      slot: "B1",
    }),
    assignment({
      active: false,
      assignment_id: "retired-old",
      exercise: "Flat barbell press",
      slot: "A2",
    }),
    assignment({
      active: false,
      assignment_id: "retired-latest",
      created_at: "2026-08-02T12:00:00Z",
      exercise: "Flat barbell press",
      slot: "A2",
    }),
  ];
  const groups = domain.currentHistoryGroups(assignments);
  assert.deepEqual(
    groups.map((group) => group.bodyPart),
    ["chest", "shoulders", "back_width", "biceps"],
  );
  assert.deepEqual(
    groups[0].assignments.map((item) => item.slot),
    ["A1", "A3"],
  );
  assert.deepEqual(
    domain
      .retiredHistoryAssignments(assignments)
      .map((item) => item.assignment_id),
    ["retired-latest", "same-exercise-other-slot"],
  );

  const workouts = domain.sortHistoryWorkouts([
    {
      completed_at: "2026-08-08T12:30:00Z",
      slot: "A1",
      started_at: "2026-08-08T12:00:00Z",
      status: "completed",
      workout_id: "older",
    },
    {
      completed_at: null,
      slot: "B1",
      started_at: "2026-08-07T12:00:00Z",
      status: "in_progress",
      workout_id: "active",
    },
    {
      completed_at: "2026-08-09T12:30:00Z",
      slot: "A2",
      started_at: "2026-08-09T12:00:00Z",
      status: "completed",
      workout_id: "newer",
    },
  ]);
  assert.deepEqual(
    workouts.map((workout) => workout.workout_id),
    ["active", "newer", "older"],
  );
  assert.deepEqual(
    [
      ...domain.activeWorkoutAssignmentIds({
        assignments: [],
        steps: [
          { assignment_id: "active-assignment", workout_id: "active" },
          { assignment_id: "completed-assignment", workout_id: "newer" },
        ],
        workouts,
      }),
    ],
    ["active-assignment"],
  );

  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260810150000_guard_history_correction_during_active_workout.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const correction = migration.match(
    /create or replace function public\.correct_workout_performance[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(correction?.includes("recalculate_assignment_logbook"));
  assert.ok(
    correction?.indexOf(
      "pg_advisory_xact_lock(hashtextextended(owner_id::text, 0))",
    ) < correction?.indexOf("active_workout.status = 'in_progress'"),
  );
  assert.ok(
    correction?.includes(
      "active_step.assignment_id = current_step.assignment_id",
    ),
  );
  assert.ok(
    correction?.includes(
      "Finish active workout before correcting this exercise",
    ),
  );
  assert.ok(!correction?.includes("finish_workout_if_ready"));
  assert.ok(!correction?.includes("workout_rotation_state"));
  assert.ok(
    !correction?.includes("update public.rotation_assignment_versions"),
  );
});
