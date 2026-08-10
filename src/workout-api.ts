import type { WorkoutSlot } from "./rotation-config.js";
import {
  isWorkoutSlot,
  sortHistoryWorkouts,
  validHistoryAssignment,
  validHistoryWorkout,
  validRotationState,
  validWorkout,
  validWorkoutStep,
  type HistoryData,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";
import { supabase } from "./lib/supabase.js";
import type { WeightEntry } from "./weight-conversion.js";

type ApiResult<T> = { data: T | null; error: string };
type HistoryTable =
  "rotation_assignment_versions" | "workouts" | "workout_steps";
type HistoryOrder = { ascending?: boolean; column: string };
const historyPageSize = 100;
const workoutStepColumns =
  "step_id,workout_id,ordinal,kind,body_part,assignment_id,exercise,protocol,structure,target_sets,status,weight_entries,reps,duration_seconds,previous_weight_entries,previous_reps,previous_duration_seconds,verdict,set_verdicts,enforcement_action,fresh_baseline,mulligan_used,reference_history,resolution,last_operation_id";
export type SaveResult = {
  completed_now?: boolean;
  next_slot: WorkoutSlot;
  step: WorkoutStep;
  workout: Workout;
};
export type LoadedWorkout = {
  lastCompletedSlot: WorkoutSlot | null;
  nextSlot: WorkoutSlot;
  steps: WorkoutStep[];
  workout: Workout | null;
};

export async function loadWorkoutState(
  userId: string,
): Promise<ApiResult<LoadedWorkout>> {
  const [rotationResult, workoutResult] = await Promise.all([
    supabase!
      .from("workout_rotation_state")
      .select("next_slot,last_completed_slot")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase!
      .from("workouts")
      .select("workout_id,slot,status,completed_at")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .maybeSingle(),
  ]);
  const initialError = workoutStateError(rotationResult, workoutResult);
  if (initialError) return failure(initialError);

  const rotation = rotationResult.data ?? {
    last_completed_slot: null,
    next_slot: "A1" as const,
  };
  const workout = workoutResult.data;
  if (!workout)
    return success({
      lastCompletedSlot: rotation.last_completed_slot,
      nextSlot: rotation.next_slot,
      steps: [],
      workout: null,
    });

  const stepResult = await supabase!
    .from("workout_steps")
    .select(workoutStepColumns)
    .eq("user_id", userId)
    .eq("workout_id", workout.workout_id)
    .order("ordinal");
  if (!validStepResult(stepResult))
    return failure("WORKOUT STEPS COULD NOT BE LOADED");
  return success({
    lastCompletedSlot: rotation.last_completed_slot,
    nextSlot: rotation.next_slot,
    steps: stepResult.data,
    workout,
  });
}

export async function loadHistoryState(
  userId: string,
): Promise<ApiResult<HistoryData>> {
  const [workouts, assignments, steps] = await Promise.all([
    loadAllHistoryRows(
      "workouts",
      "workout_id,slot,status,started_at,completed_at",
      userId,
      [{ ascending: false, column: "started_at" }, { column: "workout_id" }],
    ),
    loadAllHistoryRows(
      "rotation_assignment_versions",
      "assignment_id,slot,body_part,exercise,protocol,structure,target_sets,active,created_at",
      userId,
      [{ column: "created_at" }, { column: "assignment_id" }],
    ),
    loadAllHistoryRows("workout_steps", workoutStepColumns, userId, [
      { column: "workout_id" },
      { column: "ordinal" },
      { column: "step_id" },
    ]),
  ]);
  if (
    workouts.error ||
    assignments.error ||
    steps.error ||
    !Array.isArray(workouts.data) ||
    !workouts.data.every(validHistoryWorkout) ||
    !Array.isArray(assignments.data) ||
    !assignments.data.every(validHistoryAssignment) ||
    !Array.isArray(steps.data) ||
    !steps.data.every(validWorkoutStep)
  )
    return failure("HISTORY COULD NOT BE LOADED");
  return success({
    assignments: assignments.data as HistoryData["assignments"],
    steps: steps.data as HistoryData["steps"],
    workouts: sortHistoryWorkouts(workouts.data as HistoryData["workouts"]),
  });
}

async function loadAllHistoryRows(
  table: HistoryTable,
  columns: string,
  userId: string,
  orders: HistoryOrder[],
): Promise<{ data: unknown[] | null; error: boolean }> {
  const rows: unknown[] = [];
  let expectedCount: number | null = null;
  for (let from = 0; ; from += historyPageSize) {
    let query = supabase!
      .from(table)
      .select(columns, { count: "exact" })
      .eq("user_id", userId);
    for (const order of orders)
      query = query.order(order.column, { ascending: order.ascending ?? true });
    const page = await query.range(from, from + historyPageSize - 1);
    if (!validHistoryPage(page, expectedCount))
      return { data: null, error: true };
    expectedCount ??= page.count;
    rows.push(...page.data);
    if (rows.length === expectedCount) return { data: rows, error: false };
    if (page.data.length !== historyPageSize || rows.length > expectedCount)
      return { data: null, error: true };
  }
}

function validHistoryPage(
  page: { count: number | null; data: unknown; error: unknown },
  expectedCount: number | null,
): page is { count: number; data: unknown[]; error: null } {
  return (
    !page.error &&
    Number.isSafeInteger(page.count) &&
    page.count! >= 0 &&
    Array.isArray(page.data) &&
    (expectedCount === null || page.count === expectedCount)
  );
}

export async function correctHistoryPerformance(
  operationId: string,
  stepId: string,
  weights: WeightEntry[],
  reps: number[],
  durationSeconds: number | null,
): Promise<ApiResult<WorkoutStep>> {
  const { data, error } = await supabase!.rpc("correct_workout_performance", {
    p_duration_seconds: durationSeconds,
    p_operation_id: operationId,
    p_reps: reps,
    p_step_id: stepId,
    p_weights: weights,
  });
  if (error || !data || typeof data !== "object")
    return failure(error?.message ?? "CORRECTION COULD NOT BE SAVED");
  const result = data as Record<string, unknown>;
  return validWorkoutStep(result.step) &&
    Array.isArray(result.recalculated_steps) &&
    result.recalculated_steps.every(validWorkoutStep)
    ? success(result.step)
    : failure("CORRECTION RESPONSE WAS INVALID");
}

export async function startWorkout(
  operationId: string,
): Promise<ApiResult<Workout>> {
  const { data, error } = await supabase!.rpc("start_a1_workout", {
    p_operation_id: operationId,
  });
  return error || !validWorkout(data)
    ? failure(error?.message ?? "WORKOUT COULD NOT BE STARTED")
    : success(data);
}

export async function saveWorkoutStep(
  operationId: string,
  step: WorkoutStep,
  status: "completed" | "skipped",
  weights: WeightEntry[],
  reps: number[],
  durationSeconds: number | null,
): Promise<ApiResult<SaveResult>> {
  const { data, error } = await supabase!.rpc("save_a1_workout_step", {
    p_duration_seconds: durationSeconds,
    p_operation_id: operationId,
    p_reps: reps,
    p_status: status,
    p_step_id: step.step_id,
    p_weights: weights,
  });
  return error || !validSaveResult(data)
    ? failure(error?.message ?? "STEP COULD NOT BE SAVED")
    : success(data);
}

export async function undoWorkoutStep(
  operationId: string,
): Promise<ApiResult<WorkoutStep>> {
  const { data, error } = await supabase!.rpc("undo_a1_workout_step", {
    p_operation_id: operationId,
    p_undo_operation_id: crypto.randomUUID(),
  });
  return error || !validWorkoutStep(data)
    ? failure("UNDO COULD NOT BE SAVED")
    : success(data);
}

export async function resolveLogbookAction(
  operationId: string,
  stepId: string,
  action: "count_failure" | "count_win" | "use_mulligan",
): Promise<ApiResult<SaveResult>> {
  const { data, error } = await supabase!.rpc("resolve_logbook_action", {
    p_action: action,
    p_operation_id: operationId,
    p_step_id: stepId,
  });
  return error || !validSaveResult(data)
    ? failure(error?.message ?? "LOGBOOK DECISION COULD NOT BE SAVED")
    : success(data);
}

export async function replaceFailedAssignment(
  operationId: string,
  stepId: string,
  replacement: {
    exercise: string;
    protocol: "rest_pause" | "straight_set" | "timed_hold";
    structure: string;
    targetSets: { max: number; min: number }[];
  },
): Promise<ApiResult<SaveResult>> {
  const { data, error } = await supabase!.rpc("replace_failed_assignment", {
    p_exercise: replacement.exercise,
    p_operation_id: operationId,
    p_protocol: replacement.protocol,
    p_step_id: stepId,
    p_structure: replacement.structure,
    p_target_sets: replacement.targetSets,
  });
  return error || !validSaveResult(data)
    ? failure(error?.message ?? "EXERCISE COULD NOT BE REPLACED")
    : success(data);
}

function validSaveResult(value: unknown): value is SaveResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    isWorkoutSlot(result.next_slot) &&
    validWorkout(result.workout) &&
    validWorkoutStep(result.step) &&
    (result.completed_now === undefined ||
      typeof result.completed_now === "boolean")
  );
}

function workoutStateError(
  rotation: { data: unknown; error: unknown },
  workout: { data: unknown; error: unknown },
) {
  if (rotation.error || workout.error)
    return "WORKOUT STATE COULD NOT BE LOADED";
  if (rotation.data !== null && !validRotationState(rotation.data))
    return "WORKOUT ROTATION COULD NOT BE LOADED";
  if (workout.data !== null && !validWorkout(workout.data))
    return "WORKOUT STATE COULD NOT BE LOADED";
  return "";
}

function validStepResult(result: { data: unknown; error: unknown }): result is {
  data: WorkoutStep[];
  error: null;
} {
  return (
    !result.error &&
    Array.isArray(result.data) &&
    result.data.every(validWorkoutStep)
  );
}

function failure<T>(error: string): ApiResult<T> {
  return { data: null, error };
}

function success<T>(data: T): ApiResult<T> {
  return { data, error: "" };
}
