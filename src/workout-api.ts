import type { WorkoutSlot } from "./rotation-config.js";
import {
  isWorkoutSlot,
  validRotationState,
  validWorkout,
  validWorkoutStep,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";
import { supabase } from "./lib/supabase.js";
import type { WeightEntry } from "./weight-conversion.js";

type ApiResult<T> = { data: T | null; error: string };
type SaveResult = {
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
    .select(
      "step_id,workout_id,ordinal,kind,body_part,exercise,protocol,structure,target_sets,status,weight_entries,reps",
    )
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

export async function startA1Workout(
  operationId: string,
): Promise<ApiResult<Workout>> {
  const { data, error } = await supabase!.rpc("start_a1_workout", {
    p_operation_id: operationId,
  });
  return error || !validWorkout(data)
    ? failure(error?.message ?? "A1 WORKOUT COULD NOT BE STARTED")
    : success(data);
}

export async function saveA1WorkoutStep(
  operationId: string,
  step: WorkoutStep,
  weights: WeightEntry[],
  reps: number[],
): Promise<ApiResult<SaveResult>> {
  const { data, error } = await supabase!.rpc("save_a1_workout_step", {
    p_operation_id: operationId,
    p_reps: reps,
    p_status: "completed",
    p_step_id: step.step_id,
    p_weights: weights,
  });
  return error || !validSaveResult(data)
    ? failure(error?.message ?? "STEP COULD NOT BE SAVED")
    : success(data);
}

export async function undoA1WorkoutStep(
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
