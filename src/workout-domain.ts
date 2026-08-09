import type { WorkoutSlot } from "./rotation-config.js";

export type WeightEntry = {
  amount: string;
  micrograms?: string;
  unit: "kg" | "lb";
};

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

export function setCount(step: WorkoutStep) {
  if (step.protocol === "rest_pause") return 1;
  return Math.max(step.target_sets.length, 1);
}

export function repCount(step: WorkoutStep) {
  return step.protocol === "rest_pause" ? 3 : setCount(step);
}

export function displayBodyPart(bodyPart: string) {
  return bodyPart.replaceAll("_", " ").toUpperCase();
}

export function conversionPreview(entry: WeightEntry) {
  const micrograms = weightMicrograms(entry);
  if (micrograms === null) return "";
  const targetUnit = entry.unit === "lb" ? "kg" : "lb";
  const stepMicrograms = targetUnit === "kg" ? 250000000n : 226796185n;
  const steps = (micrograms + stepMicrograms / 2n) / stepMicrograms;
  const divisor = targetUnit === "kg" ? 4n : 2n;
  const whole = steps / divisor;
  const remainder = steps % divisor;
  const fraction =
    targetUnit === "kg"
      ? ["", ".25", ".5", ".75"][Number(remainder)]
      : remainder === 0n
        ? ""
        : ".5";
  return `≈ ${whole}${fraction} ${targetUnit}`;
}

export function weightMicrograms(entry: WeightEntry) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(entry.amount);
  if (!match) return null;
  const cents =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const centsPerStep = entry.unit === "lb" ? 50n : 25n;
  if (cents === 0n || cents % centsPerStep !== 0n) return null;
  const microgramsPerStep = entry.unit === "lb" ? 226796185n : 250000000n;
  return (cents / centsPerStep) * microgramsPerStep;
}

export function validWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.workout_id === "string" &&
    typeof row.slot === "string" &&
    (row.status === "in_progress" || row.status === "completed")
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
    Number.isInteger(row.ordinal)
  );
}

function validStepState(row: Record<string, unknown>) {
  const kindValid = row.kind === "exercise" || row.kind === "stretch";
  const statusValid = ["pending", "completed", "skipped"].includes(
    row.status as string,
  );
  return kindValid && statusValid;
}

function validStepCollections(row: Record<string, unknown>) {
  return [row.target_sets, row.weight_entries, row.reps].every(Array.isArray);
}
