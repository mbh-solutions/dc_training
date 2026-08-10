import { useRef, useState } from "react";
import {
  clearRecentCompletion,
  startWorkoutPayload,
  stepTarget,
  type OfflineAccountState,
  type OfflineOperationInput,
} from "../offline-sync.js";
import type { WeightEntry } from "../weight-conversion.js";
import type { WorkoutStep } from "../workout-domain.js";
import type {
  AssignmentPosition,
  Protocol,
  TargetSet,
} from "../rotation-config.js";

export type CommitOperation = (
  operation: OfflineOperationInput,
) => Promise<{ data: OfflineAccountState | null; error: string }>;

export function useWorkout(
  userId: string,
  state: OfflineAccountState | null,
  commitOperation: CommitOperation,
) {
  const [actionSaving, setActionSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [replacementStep, setReplacementStep] = useState<WorkoutStep | null>(
    null,
  );
  const pendingOperationIds = useRef(new Map<string, string>());
  const workout = workoutView(state);
  const operation = operationView(state);

  const submit = async (operation: OfflineOperationInput, key: string) => {
    setActionSaving(true);
    setMessage("");
    const result = await commitOperation(operation);
    setActionSaving(false);
    if (!result.data) {
      setMessage(result.error);
      return false;
    }
    pendingOperationIds.current.delete(key);
    return true;
  };

  const start = async () => {
    if (!state) return false;
    const key = "start_workout";
    const operationId = retryOperationId(pendingOperationIds.current, key);
    return submit(
      {
        id: operationId,
        kind: "start_workout",
        payload: startWorkoutPayload(state),
      },
      key,
    );
  };

  const transitionLifecycle = async (
    action: "dismiss_suggestion" | "start_cruise" | "start_new_blast",
  ) => {
    const key = `lifecycle:${action}`;
    return submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "transition_training_lifecycle",
        payload: { action },
      },
      key,
    );
  };

  const saveStep = async (
    step: WorkoutStep,
    weights: WeightEntry[] = [],
    reps: number[] = [],
    durationSeconds: number | null = null,
  ) => submitStep(step, "completed", weights, reps, durationSeconds);

  const skipStep = async (step: WorkoutStep) =>
    submitStep(step, "skipped", [], [], null);

  const submitStep = async (
    step: WorkoutStep,
    status: "completed" | "skipped",
    weights: WeightEntry[],
    reps: number[],
    durationSeconds: number | null,
  ) => {
    if (!state) return false;
    const key = step.step_id;
    return submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "save_workout_step",
        payload: {
          ...stepTarget(state, step),
          duration_seconds: durationSeconds,
          reps,
          status,
          weights,
        },
      },
      key,
    );
  };

  const resolveAction = async (
    step: WorkoutStep,
    action: "count_failure" | "count_win" | "use_mulligan",
  ) => {
    if (!state) return false;
    const key = `${step.step_id}:${action}`;
    return submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "resolve_logbook_action",
        payload: { ...stepTarget(state, step), action },
      },
      key,
    );
  };

  const replaceAssignment = async (
    step: WorkoutStep,
    exercise: string,
    protocol: Protocol,
    structure: string,
    targetSets: TargetSet[],
  ) => {
    if (!state || !workout.activeWorkout) return false;
    const key = `${step.step_id}:replace`;
    const replaced = await submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "replace_failed_assignment",
        payload: {
          ...stepTarget(state, step),
          body_part: step.body_part as AssignmentPosition,
          exercise,
          protocol,
          slot: workout.activeWorkout.slot,
          structure,
          target_sets: targetSets,
        },
      },
      key,
    );
    if (replaced) setReplacementStep(null);
    return replaced;
  };

  const undo = async () => {
    if (!operation.recent) return;
    const key = `undo:${operation.recent.id}`;
    await submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "undo_workout_step",
        payload: { original_operation_id: operation.recent.id },
      },
      key,
    );
  };

  return {
    actionSaving,
    activeWorkout: workout.activeWorkout,
    blockingStep: workout.blockingStep,
    beginReplacement: setReplacementStep,
    completedWorkout: operation.completedWorkout,
    dismissCompleted: async () => clearRecentCompletion(userId),
    dismissCruiseSuggestion: () => transitionLifecycle("dismiss_suggestion"),
    lastCompletedSlot: workout.lastCompletedSlot,
    lastOperationId: operation.lastOperationId,
    lastOperationStatus: operation.lastOperationStatus,
    lifecycle: workout.lifecycle,
    loading: workout.loading,
    message,
    nextSlot: workout.nextSlot,
    replaceAssignment,
    replacementStep,
    resolveAction,
    saveStep,
    skipStep,
    start,
    startCruise: () => transitionLifecycle("start_cruise"),
    startNewBlast: () => transitionLifecycle("start_new_blast"),
    steps: workout.steps,
    undo,
  };
}

function workoutView(state: OfflineAccountState | null) {
  if (!state?.workout) {
    return {
      activeWorkout: null,
      blockingStep: null,
      lastCompletedSlot: null,
      lifecycle: null,
      loading: state === null,
      nextSlot: "A1" as const,
      steps: [] as WorkoutStep[],
    };
  }
  const workout = state.workout;
  return {
    activeWorkout: workout.workout,
    blockingStep:
      workout.steps.find((step) => step.enforcement_action !== null) ?? null,
    lastCompletedSlot: workout.lastCompletedSlot,
    lifecycle: workout.lifecycle,
    loading: false,
    nextSlot: workout.nextSlot,
    steps: workout.steps,
  };
}

function operationView(state: OfflineAccountState | null) {
  const recent = state?.recentOperation ?? null;
  return {
    completedWorkout: state?.recentlyCompletedWorkout ?? null,
    lastOperationId: recent?.id ?? null,
    lastOperationStatus: recent?.status ?? null,
    recent,
  };
}

function retryOperationId(operationIds: Map<string, string>, key: string) {
  const operationId = operationIds.get(key) ?? crypto.randomUUID();
  operationIds.set(key, operationId);
  return operationId;
}
