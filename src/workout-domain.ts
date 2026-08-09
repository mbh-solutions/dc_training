import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";
import type { WeightEntry } from "./weight-conversion.js";

export type Workout = {
  completed_at: string | null;
  slot: WorkoutSlot;
  status: "completed" | "in_progress";
  workout_id: string;
};

export type WorkoutStep = {
  body_part: string;
  exercise: string | null;
  kind: "exercise" | "stretch";
  ordinal: number;
  protocol: "rest_pause" | "straight_set" | null;
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
]);
const stretchBodyParts = new Set(["chest", "shoulders", "triceps", "back"]);

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
    Number(row.ordinal) > 0
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
  return (
    exerciseBodyParts.has(row.body_part as string) &&
    typeof row.exercise === "string" &&
    (row.protocol === "rest_pause" || row.protocol === "straight_set") &&
    typeof row.structure === "string"
  );
}

function validStretchState(row: Record<string, unknown>) {
  return (
    stretchBodyParts.has(row.body_part as string) &&
    row.exercise === null &&
    row.protocol === null &&
    row.structure === null
  );
}

function validCollectionShape(row: Record<string, unknown>): row is Record<
  string,
  unknown
> & {
  reps: unknown[];
  target_sets: unknown[];
  weight_entries: unknown[];
} {
  return [row.target_sets, row.weight_entries, row.reps].every(Array.isArray);
}

function validEmptyCollections(row: {
  reps: unknown[];
  target_sets: unknown[];
  weight_entries: unknown[];
}) {
  return [row.target_sets, row.weight_entries, row.reps].every(
    (items) => items.length === 0,
  );
}

function validExerciseCollections(
  row: Record<string, unknown> & {
    reps: unknown[];
    target_sets: unknown[];
    weight_entries: unknown[];
  },
) {
  if (row.target_sets.length === 0 || !row.target_sets.every(validTargetSet))
    return false;
  if (row.status !== "completed")
    return row.weight_entries.length === 0 && row.reps.length === 0;
  const expected = row.protocol === "rest_pause" ? 3 : row.target_sets.length;
  return (
    row.weight_entries.length ===
      (row.protocol === "rest_pause" ? 1 : expected) &&
    row.weight_entries.every(validWeightEntry) &&
    row.reps.length === expected &&
    row.reps.every((rep) => Number.isInteger(rep) && Number(rep) > 0)
  );
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
