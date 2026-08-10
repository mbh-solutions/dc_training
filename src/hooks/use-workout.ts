import { useRef, useState } from "react";
import {
  clearRecentCompletion,
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
  const workout = state?.workout ?? null;
  const recentOperation = state?.recentOperation ?? null;

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
    const key = "start_workout";
    const operationId = retryOperationId(pendingOperationIds.current, key);
    return submit(
      { id: operationId, kind: "start_workout", payload: {} },
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
    if (!state || !workout?.workout) return false;
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
          slot: workout.workout.slot,
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
    if (!recentOperation) return;
    const key = `undo:${recentOperation.id}`;
    await submit(
      {
        id: retryOperationId(pendingOperationIds.current, key),
        kind: "undo_workout_step",
        payload: { original_operation_id: recentOperation.id },
      },
      key,
    );
  };

  return {
    actionSaving,
    activeWorkout: workout?.workout ?? null,
    blockingStep:
      workout?.steps.find((step) => step.enforcement_action !== null) ?? null,
    beginReplacement: setReplacementStep,
    completedWorkout: state?.recentlyCompletedWorkout ?? null,
    dismissCompleted: async () => clearRecentCompletion(userId),
    dismissCruiseSuggestion: () => transitionLifecycle("dismiss_suggestion"),
    lastCompletedSlot: workout?.lastCompletedSlot ?? null,
    lastOperationId: recentOperation?.id ?? null,
    lastOperationStatus: recentOperation?.status ?? null,
    lifecycle: workout?.lifecycle ?? null,
    loading: state === null,
    message,
    nextSlot: workout?.nextSlot ?? "A1",
    replaceAssignment,
    replacementStep,
    resolveAction,
    saveStep,
    skipStep,
    start,
    startCruise: () => transitionLifecycle("start_cruise"),
    startNewBlast: () => transitionLifecycle("start_new_blast"),
    steps: workout?.steps ?? [],
    undo,
  };
}

function retryOperationId(operationIds: Map<string, string>, key: string) {
  const operationId = operationIds.get(key) ?? crypto.randomUUID();
  operationIds.set(key, operationId);
  return operationId;
}
