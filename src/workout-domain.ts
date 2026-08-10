import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";
import type { WeightEntry } from "./weight-conversion.js";

export type Workout = {
  completed_at: string | null;
  slot: WorkoutSlot;
  status: "completed" | "in_progress";
  workout_id: string;
};

export type WorkoutStep = {
  assignment_id: string | null;
  body_part: string;
  duration_seconds: number | null;
  exercise: string | null;
  kind: "exercise" | "stretch";
  ordinal: number;
  previous_duration_seconds: number | null;
  previous_reps: number[];
  previous_weight_entries: WeightEntry[];
  protocol: "rest_pause" | "straight_set" | "timed_hold" | null;
  reps: number[];
  status: "completed" | "pending" | "skipped";
  step_id: string;
  structure: string | null;
  target_sets: { max: number; min: number }[];
  weight_entries: WeightEntry[];
  workout_id: string;
};

const exerciseBodyParts = new Set([
  "chest",
  "shoulders",
  "triceps",
  "back_width",
  "back_thickness",
  "biceps",
  "forearms",
  "calves",
  "hamstrings",
  "quadriceps",
  "abs_1",
  "abs_2",
]);
const stretchBodyParts = new Set([
  "chest",
  "shoulders",
  "triceps",
  "biceps",
  "back",
  "hamstrings",
  "quadriceps",
]);

export type WorkoutEntryShape = {
  metric: "reps" | "seconds";
  valueCount: number;
  weightCount: number;
};

export function workoutEntryShape(
  step: Pick<WorkoutStep, "protocol" | "target_sets">,
): WorkoutEntryShape {
  if (step.protocol === "rest_pause")
    return { metric: "reps", valueCount: 3, weightCount: 1 };
  if (step.protocol === "timed_hold")
    return { metric: "seconds", valueCount: 1, weightCount: 1 };
  const sets = Math.max(step.target_sets.length, 1);
  return { metric: "reps", valueCount: sets, weightCount: sets };
}

export function isWorkoutSlot(value: unknown): value is WorkoutSlot {
  return WORKOUT_SLOTS.includes(value as WorkoutSlot);
}

export function validRotationState(value: unknown): value is {
  last_completed_slot: WorkoutSlot | null;
  next_slot: WorkoutSlot;
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    isWorkoutSlot(row.next_slot) &&
    (row.last_completed_slot === null || isWorkoutSlot(row.last_completed_slot))
  );
}

export function validWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.workout_id === "string" &&
    isWorkoutSlot(row.slot) &&
    (row.status === "in_progress" || row.status === "completed") &&
    (row.status === "in_progress"
      ? row.completed_at === null
      : typeof row.completed_at === "string")
  );
}

export function validWorkoutStep(value: unknown): value is WorkoutStep {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    validStepIdentity(row) && validStepState(row) && validStepCollections(row)
  );
}

function validStepIdentity(row: Record<string, unknown>) {
  return (
    typeof row.step_id === "string" &&
    typeof row.workout_id === "string" &&
    Number.isInteger(row.ordinal) &&
    Number(row.ordinal) > 0 &&
    Number(row.ordinal) <= 10
  );
}

function validStepState(row: Record<string, unknown>) {
  const kindValid = row.kind === "exercise" || row.kind === "stretch";
  const statusValid = ["pending", "completed", "skipped"].includes(
    row.status as string,
  );
  if (!kindValid || !statusValid) return false;
  return row.kind === "exercise"
    ? validExerciseState(row)
    : validStretchState(row);
}

function validStepCollections(row: Record<string, unknown>) {
  if (!validCollectionShape(row)) return false;
  return row.kind === "stretch"
    ? validEmptyCollections(row)
    : validExerciseCollections(row);
}

function validExerciseState(row: Record<string, unknown>) {
  const abs = row.body_part === "abs_1" || row.body_part === "abs_2";
  return (
    exerciseBodyParts.has(row.body_part as string) &&
    typeof row.assignment_id === "string" &&
    typeof row.exercise === "string" &&
    (abs
      ? row.protocol === "straight_set" || row.protocol === "timed_hold"
      : row.protocol === "rest_pause" || row.protocol === "straight_set") &&
    typeof row.structure === "string"
  );
}

function validStretchState(row: Record<string, unknown>) {
  return (
    stretchBodyParts.has(row.body_part as string) &&
    row.assignment_id === null &&
    row.exercise === null &&
    row.protocol === null &&
    row.structure === null
  );
}

function validCollectionShape(row: Record<string, unknown>): row is Record<
  string,
  unknown
> & {
  duration_seconds: unknown;
  previous_duration_seconds: unknown;
  previous_reps: unknown[];
  previous_weight_entries: unknown[];
  reps: unknown[];
  target_sets: unknown[];
  weight_entries: unknown[];
} {
  return [
    row.target_sets,
    row.weight_entries,
    row.reps,
    row.previous_weight_entries,
    row.previous_reps,
  ].every(Array.isArray);
}

function validEmptyCollections(row: {
  duration_seconds: unknown;
  previous_duration_seconds: unknown;
  previous_reps: unknown[];
  previous_weight_entries: unknown[];
  reps: unknown[];
  target_sets: unknown[];
  weight_entries: unknown[];
}) {
  return (
    [
      row.target_sets,
      row.weight_entries,
      row.reps,
      row.previous_weight_entries,
      row.previous_reps,
    ].every((items) => items.length === 0) &&
    row.duration_seconds === null &&
    row.previous_duration_seconds === null
  );
}

function validExerciseCollections(
  row: Record<string, unknown> & {
    previous_reps: unknown[];
    previous_weight_entries: unknown[];
    reps: unknown[];
    target_sets: unknown[];
    weight_entries: unknown[];
  },
) {
  if (!row.target_sets.every(validTargetSet)) return false;
  if (row.protocol === "rest_pause" && row.target_sets.length !== 1)
    return false;
  if (row.protocol === "timed_hold" && row.target_sets.length !== 0)
    return false;
  const shape = workoutEntryShape(row as WorkoutStep);
  const currentValid =
    row.status === "completed"
      ? validPerformance(
          shape,
          row.weight_entries,
          row.reps,
          row.duration_seconds,
        )
      : emptyPerformance(row.weight_entries, row.reps, row.duration_seconds);
  const previousValid =
    emptyPerformance(
      row.previous_weight_entries,
      row.previous_reps,
      row.previous_duration_seconds,
    ) ||
    validPerformance(
      shape,
      row.previous_weight_entries,
      row.previous_reps,
      row.previous_duration_seconds,
    );
  return currentValid && previousValid;
}

function emptyPerformance(
  weights: unknown[],
  reps: unknown[],
  duration: unknown,
) {
  return weights.length === 0 && reps.length === 0 && duration === null;
}

function validPerformance(
  shape: WorkoutEntryShape,
  weights: unknown[],
  reps: unknown[],
  duration: unknown,
) {
  if (weights.length !== shape.weightCount || !weights.every(validWeightEntry))
    return false;
  return shape.metric === "seconds"
    ? reps.length === 0 && Number.isInteger(duration) && Number(duration) > 0
    : duration === null &&
        reps.length === shape.valueCount &&
        reps.every((rep) => Number.isInteger(rep) && Number(rep) > 0);
}

function validTargetSet(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  return (
    Number.isInteger(target.min) &&
    Number.isInteger(target.max) &&
    Number(target.min) > 0 &&
    Number(target.max) >= Number(target.min)
  );
}

function validWeightEntry(value: unknown): value is WeightEntry {
  if (!value || typeof value !== "object") return false;
  const weight = value as Record<string, unknown>;
  return (
    typeof weight.amount === "string" &&
    (weight.unit === "lb" || weight.unit === "kg") &&
    typeof weight.micrograms === "string" &&
    /^\d+$/.test(weight.micrograms)
  );
}
