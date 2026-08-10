import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";
import type { WeightEntry } from "./weight-conversion.js";

export type Workout = {
  completed_at: string | null;
  slot: WorkoutSlot;
  status: "completed" | "in_progress";
  workout_id: string;
};

export type HistoryWorkout = Workout & {
  started_at: string;
};

export type HistoryAssignment = {
  active: boolean;
  assignment_id: string;
  body_part: string;
  created_at: string;
  exercise: string;
  protocol: "rest_pause" | "straight_set" | "timed_hold";
  slot: WorkoutSlot;
  structure: string;
  target_sets: { max: number; min: number }[];
};

export type HistoryData = {
  assignments: HistoryAssignment[];
  steps: WorkoutStep[];
  workouts: HistoryWorkout[];
};

export type TrainingLifecycle = {
  blast_ended_at: string | null;
  blast_id: string | null;
  blast_started_at: string | null;
  cruise_started_at: string | null;
  phase: "blast" | "cruise";
  suggestion_dismissed: boolean;
  suggestion_due: boolean;
};

export const initialTrainingLifecycle: TrainingLifecycle = {
  blast_ended_at: null,
  blast_id: null,
  blast_started_at: null,
  cruise_started_at: null,
  phase: "blast",
  suggestion_dismissed: false,
  suggestion_due: false,
};

export type WorkoutStep = {
  assignment_id: string | null;
  body_part: string;
  duration_seconds: number | null;
  enforcement_action:
    "abs_choice" | "first_failure" | "replacement_required" | null;
  exercise: string | null;
  fresh_baseline: boolean;
  kind: "exercise" | "stretch";
  last_operation_id: string | null;
  mulligan_used: boolean;
  ordinal: number;
  previous_duration_seconds: number | null;
  previous_reps: number[];
  previous_weight_entries: WeightEntry[];
  protocol: "rest_pause" | "straight_set" | "timed_hold" | null;
  reference_history: PerformanceHistoryEntry[];
  reps: number[];
  resolution:
    "count_failure" | "count_win" | "replaced" | "use_mulligan" | null;
  set_verdicts: ("failure" | "tie" | "win")[];
  status: "completed" | "pending" | "skipped";
  step_id: string;
  structure: string | null;
  target_sets: { max: number; min: number }[];
  weight_entries: WeightEntry[];
  workout_id: string;
  verdict: "failure" | "win" | null;
};

export type PerformanceHistoryEntry = {
  assignment_id: string;
  duration_seconds: number | null;
  performed_at: string;
  protocol: "rest_pause" | "straight_set" | "timed_hold";
  reps: number[];
  structure: string;
  target_sets: { max: number; min: number }[];
  verdict: "failure" | "win" | null;
  weight_entries: WeightEntry[];
};

export type LogbookVerdict = "ambiguous" | "baseline" | "failure" | "win";
export type SetVerdict = "failure" | "tie" | "win";

export type LogbookPerformance = {
  durationSeconds: number | null;
  reps: number[];
  weights: WeightEntry[];
};

export type LogbookComparison = {
  setVerdicts: SetVerdict[];
  verdict: LogbookVerdict;
};

export function compareLogbookPerformance({
  bodyPart,
  current,
  previous,
  protocol,
  targetSets,
}: {
  bodyPart: string;
  current: LogbookPerformance;
  previous: LogbookPerformance | null;
  protocol: "rest_pause" | "straight_set" | "timed_hold";
  targetSets: { max: number; min: number }[];
}): LogbookComparison {
  if (!previous || previous.weights.length === 0)
    return { setVerdicts: [], verdict: "baseline" };
  if (bodyPart === "abs_1" || bodyPart === "abs_2")
    return compareAbs(current, previous, protocol);
  if (protocol === "rest_pause")
    return compareRestPause(current, previous, targetSets[0]);
  return compareStraightSets(current, previous, targetSets);
}

function compareAbs(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  protocol: "rest_pause" | "straight_set" | "timed_hold",
): LogbookComparison {
  const weight = compareWeight(current.weights[0], previous.weights[0]);
  const currentMetric = absMetric(current, protocol);
  const previousMetric = absMetric(previous, protocol);
  const metric = Math.sign(currentMetric - previousMetric);
  return { setVerdicts: [], verdict: absVerdict(weight, metric) };
}

function absMetric(
  performance: LogbookPerformance,
  protocol: "rest_pause" | "straight_set" | "timed_hold",
) {
  return protocol === "timed_hold"
    ? performance.durationSeconds!
    : performance.reps[0];
}

function absVerdict(weight: number, metric: number): LogbookVerdict {
  if (weight > 0) return metric >= 0 ? "win" : "ambiguous";
  if (weight < 0) return metric <= 0 ? "failure" : "ambiguous";
  return metric > 0 ? "win" : "failure";
}

function compareRestPause(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  target: { max: number; min: number },
): LogbookComparison {
  const weight = compareWeight(current.weights[0], previous.weights[0]);
  const total = sum(current.reps);
  const previousTotal = sum(previous.reps);
  const win =
    (weight > 0 && total >= target.min && total <= target.max) ||
    (weight === 0 && total > previousTotal);
  return { setVerdicts: [], verdict: win ? "win" : "failure" };
}

function compareStraightSets(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  targets: { max: number; min: number }[],
): LogbookComparison {
  const setVerdicts = current.weights.map((weight, index) => {
    const weightResult = compareWeight(weight, previous.weights[index]);
    const reps = current.reps[index];
    const previousReps = previous.reps[index];
    const target = targets[index] ?? { min: 1, max: 2_147_483_647 };
    if (
      (weightResult > 0 && reps >= target.min && reps <= target.max) ||
      (weightResult === 0 && reps > previousReps)
    )
      return "win";
    if (weightResult === 0 && reps === previousReps) return "tie";
    return "failure";
  });
  return {
    setVerdicts,
    verdict: setVerdicts.includes("win") ? "win" : "failure",
  };
}

function compareWeight(current: WeightEntry, previous: WeightEntry) {
  const difference = BigInt(current.micrograms!) - BigInt(previous.micrograms!);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

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

export const HISTORY_BODY_PARTS = [
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
] as const;

export function sortHistoryWorkouts(workouts: HistoryWorkout[]) {
  return [...workouts].sort(
    (left, right) =>
      Number(right.status === "in_progress") -
        Number(left.status === "in_progress") ||
      Date.parse(right.started_at) - Date.parse(left.started_at),
  );
}

export function currentHistoryGroups(assignments: HistoryAssignment[]) {
  return HISTORY_BODY_PARTS.map((bodyPart) => ({
    assignments: assignments
      .filter(
        (assignment) => assignment.active && assignment.body_part === bodyPart,
      )
      .sort((left, right) =>
        left.slot.localeCompare(right.slot, "en", { numeric: true }),
      ),
    bodyPart,
  })).filter((group) => group.assignments.length > 0);
}

export function retiredHistoryAssignments(assignments: HistoryAssignment[]) {
  const active = new Set(
    assignments
      .filter((assignment) => assignment.active)
      .map(historyAssignmentKey),
  );
  const retired = new Map<string, HistoryAssignment>();
  for (const assignment of assignments) {
    const key = historyAssignmentKey(assignment);
    const previous = retired.get(key);
    if (
      !assignment.active &&
      !active.has(key) &&
      (!previous ||
        Date.parse(assignment.created_at) > Date.parse(previous.created_at))
    )
      retired.set(key, assignment);
  }
  return [...retired.values()].sort(
    (left, right) =>
      HISTORY_BODY_PARTS.indexOf(
        left.body_part as (typeof HISTORY_BODY_PARTS)[number],
      ) -
        HISTORY_BODY_PARTS.indexOf(
          right.body_part as (typeof HISTORY_BODY_PARTS)[number],
        ) || left.slot.localeCompare(right.slot, "en", { numeric: true }),
  );
}

export function historyAssignmentKey(
  assignment: Pick<HistoryAssignment, "body_part" | "exercise" | "slot">,
) {
  return `${assignment.slot}:${assignment.body_part}:${assignment.exercise}`;
}

export function activeWorkoutAssignmentIds(data: HistoryData) {
  const activeWorkoutIds = new Set(
    data.workouts
      .filter((workout) => workout.status === "in_progress")
      .map((workout) => workout.workout_id),
  );
  return new Set(
    data.steps
      .filter(
        (step) =>
          step.assignment_id !== null && activeWorkoutIds.has(step.workout_id),
      )
      .map((step) => step.assignment_id!),
  );
}

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

export function validTrainingLifecycle(
  value: unknown,
): value is TrainingLifecycle {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!hasLifecycleFields(row)) return false;
  if (row.phase === "blast") return validBlastLifecycle(row);
  return row.phase === "cruise" && validCruiseLifecycle(row);
}

function hasLifecycleFields(row: Record<string, unknown>) {
  return (
    typeof row.blast_id === "string" &&
    typeof row.blast_started_at === "string" &&
    typeof row.suggestion_dismissed === "boolean" &&
    typeof row.suggestion_due === "boolean"
  );
}

function validBlastLifecycle(row: Record<string, unknown>) {
  return row.blast_ended_at === null && row.cruise_started_at === null;
}

function validCruiseLifecycle(row: Record<string, unknown>) {
  return (
    typeof row.blast_ended_at === "string" &&
    typeof row.cruise_started_at === "string" &&
    row.suggestion_due === false
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

export function validHistoryWorkout(value: unknown): value is HistoryWorkout {
  return (
    validWorkout(value) &&
    typeof (value as Record<string, unknown>).started_at === "string"
  );
}

export function validHistoryAssignment(
  value: unknown,
): value is HistoryAssignment {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    validHistoryAssignmentIdentity(row) &&
    validHistoryAssignmentProtocol(row) &&
    validHistoryConfiguration(row)
  );
}

function validHistoryAssignmentIdentity(row: Record<string, unknown>) {
  return (
    typeof row.active === "boolean" &&
    typeof row.assignment_id === "string" &&
    exerciseBodyParts.has(row.body_part as string) &&
    typeof row.created_at === "string" &&
    typeof row.exercise === "string" &&
    isWorkoutSlot(row.slot) &&
    typeof row.structure === "string"
  );
}

function validHistoryAssignmentProtocol(row: Record<string, unknown>) {
  if (row.body_part === "abs_1" || row.body_part === "abs_2")
    return row.protocol === "straight_set" || row.protocol === "timed_hold";
  return row.protocol === "rest_pause" || row.protocol === "straight_set";
}

export function validWorkoutStep(value: unknown): value is WorkoutStep {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    validStepIdentity(row) &&
    validStepState(row) &&
    validLogbookState(row) &&
    validStepCollections(row)
  );
}

function validLogbookState(row: Record<string, unknown>) {
  return (
    [null, "abs_choice", "first_failure", "replacement_required"].includes(
      row.enforcement_action as string | null,
    ) &&
    typeof row.fresh_baseline === "boolean" &&
    validNullableString(row.last_operation_id) &&
    typeof row.mulligan_used === "boolean" &&
    [null, "count_failure", "count_win", "replaced", "use_mulligan"].includes(
      row.resolution as string | null,
    ) &&
    [null, "failure", "win"].includes(row.verdict as string | null) &&
    Array.isArray(row.set_verdicts) &&
    row.set_verdicts.every((item) =>
      ["failure", "tie", "win"].includes(item as string),
    ) &&
    Array.isArray(row.reference_history) &&
    row.reference_history.every(validHistoryEntry)
  );
}

function validNullableString(value: unknown) {
  return value === null || typeof value === "string";
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

function validHistoryEntry(value: unknown): value is PerformanceHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.assignment_id === "string" &&
    typeof row.performed_at === "string" &&
    validHistoryConfiguration(row) &&
    validHistoryWeights(row.weight_entries) &&
    validHistoryReps(row.reps) &&
    validHistoryDuration(row.duration_seconds) &&
    validHistoryVerdict(row.verdict)
  );
}

function validHistoryConfiguration(row: Record<string, unknown>) {
  const protocolValid = ["rest_pause", "straight_set", "timed_hold"].includes(
    row.protocol as string,
  );
  if (
    !protocolValid ||
    typeof row.structure !== "string" ||
    !Array.isArray(row.target_sets) ||
    !row.target_sets.every(validTargetSet)
  )
    return false;
  if (row.protocol === "rest_pause") return row.target_sets.length === 1;
  if (row.protocol === "timed_hold") return row.target_sets.length === 0;
  return true;
}

function validHistoryWeights(value: unknown) {
  return Array.isArray(value) && value.every(validWeightEntry);
}

function validHistoryReps(value: unknown) {
  return Array.isArray(value) && value.every(validPositiveInteger);
}

function validPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function validHistoryDuration(value: unknown) {
  return value === null || validPositiveInteger(value);
}

function validHistoryVerdict(value: unknown) {
  return value === null || value === "failure" || value === "win";
}
