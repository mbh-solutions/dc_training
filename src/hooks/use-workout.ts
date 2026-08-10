import { useCallback, useEffect, useRef, useState } from "react";
import type { Workout, WorkoutStep } from "../workout-domain.js";
import {
  loadWorkoutState,
  replaceFailedAssignment,
  resolveLogbookAction,
  saveWorkoutStep,
  startWorkout,
  undoWorkoutStep,
  type SaveResult,
} from "../workout-api.js";
import type { WeightEntry } from "../weight-conversion.js";
import type { WorkoutSlot } from "../rotation-config.js";
import type { Protocol, TargetSet } from "../rotation-config.js";

export type WorkoutOperationStatus =
  "baseline" | "completed" | "skipped" | "win" | null;

export function useWorkout(userId: string, online: boolean) {
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(
    null,
  );
  const [lastCompletedSlot, setLastCompletedSlot] =
    useState<WorkoutSlot | null>(null);
  const [lastOperationId, setLastOperationId] = useState<string | null>(null);
  const [lastOperationStatus, setLastOperationStatus] =
    useState<WorkoutOperationStatus>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [nextSlot, setNextSlot] = useState<WorkoutSlot>("A1");
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [replacementStep, setReplacementStep] = useState<WorkoutStep | null>(
    null,
  );
  const pendingOperationIds = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await loadWorkoutState(userId);
    if (!result.data) {
      setMessage(result.error);
      setLoading(false);
      return;
    }
    setNextSlot(result.data.nextSlot);
    setLastCompletedSlot(result.data.lastCompletedSlot);
    setActiveWorkout(result.data.workout);
    setSteps(result.data.steps);
    setMessage("");
    setLoading(false);
  }, [online, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setMessage("");
    const operationId = crypto.randomUUID();
    const result = await startWorkout(operationId);
    if (!result.data) {
      setMessage(
        result.error.includes("saved assignments")
          ? `FINISH ALL ${nextSlot} ASSIGNMENTS IN ROTATION SETUP`
          : "WORKOUT COULD NOT BE STARTED",
      );
      return false;
    }
    await load();
    return true;
  };

  const saveStep = async (
    step: WorkoutStep,
    weights: WeightEntry[] = [],
    reps: number[] = [],
    durationSeconds: number | null = null,
  ) => {
    return submitStep(step, "completed", weights, reps, durationSeconds);
  };

  const skipStep = async (step: WorkoutStep) => {
    return submitStep(step, "skipped", [], [], null);
  };

  const submitStep = async (
    step: WorkoutStep,
    status: "completed" | "skipped",
    weights: WeightEntry[],
    reps: number[],
    durationSeconds: number | null,
  ) => {
    const operationId = retryOperationId(
      pendingOperationIds.current,
      step.step_id,
    );
    const response = await saveWorkoutStep(
      operationId,
      step,
      status,
      weights,
      reps,
      durationSeconds,
    );
    if (!response.data) {
      setMessage(response.error);
      return false;
    }
    const result = response.data;
    pendingOperationIds.current.delete(step.step_id);
    applySaveResult(result);
    setLastOperationId(operationId);
    setLastOperationStatus(operationStatus(result.step));
    return true;
  };

  const applySaveResult = (result: SaveResult) => {
    setMessage("");
    setNextSlot(result.next_slot);
    setSteps((current) =>
      current.map((item) =>
        item.step_id === result.step.step_id ? result.step : item,
      ),
    );
    if (result.workout.status === "completed") {
      setCompletedWorkout(result.workout);
      setLastCompletedSlot(result.workout.slot);
      setActiveWorkout(null);
    } else {
      setActiveWorkout(result.workout);
    }
  };

  const resolveAction = async (
    step: WorkoutStep,
    action: "count_failure" | "count_win" | "use_mulligan",
  ) => {
    const key = `${step.step_id}:${action}`;
    const operationId = retryOperationId(pendingOperationIds.current, key);
    setActionSaving(true);
    const response = await resolveLogbookAction(
      operationId,
      step.step_id,
      action,
    );
    setActionSaving(false);
    if (!response.data) {
      setMessage(response.error);
      return false;
    }
    pendingOperationIds.current.delete(key);
    applySaveResult(response.data);
    if (response.data.step.enforcement_action === null) {
      setLastOperationId(null);
      setLastOperationStatus(null);
    }
    return true;
  };

  const replaceAssignment = async (
    step: WorkoutStep,
    exercise: string,
    protocol: Protocol,
    structure: string,
    targetSets: TargetSet[],
  ) => {
    const key = `${step.step_id}:replace`;
    const operationId = retryOperationId(pendingOperationIds.current, key);
    setActionSaving(true);
    const response = await replaceFailedAssignment(operationId, step.step_id, {
      exercise,
      protocol,
      structure,
      targetSets,
    });
    setActionSaving(false);
    if (!response.data) {
      setMessage(response.error);
      return false;
    }
    pendingOperationIds.current.delete(key);
    applySaveResult(response.data);
    setReplacementStep(null);
    setLastOperationId(null);
    setLastOperationStatus(null);
    return true;
  };

  const undo = async () => {
    if (!lastOperationId) return;
    const result = await undoWorkoutStep(lastOperationId);
    if (!result.data) {
      setMessage(result.error);
      return;
    }
    setSteps((current) =>
      current.map((item) =>
        item.step_id === result.data!.step_id ? result.data! : item,
      ),
    );
    if (completedWorkout) {
      setCompletedWorkout(null);
      await load();
    }
    setLastOperationId(null);
    setLastOperationStatus(null);
    setMessage("");
  };

  return {
    actionSaving,
    activeWorkout,
    blockingStep:
      steps.find((step) => step.enforcement_action !== null) ?? null,
    beginReplacement: setReplacementStep,
    completedWorkout,
    dismissCompleted: () => {
      setCompletedWorkout(null);
      setLastOperationId(null);
      setLastOperationStatus(null);
    },
    lastCompletedSlot,
    lastOperationId,
    lastOperationStatus,
    loading,
    message,
    nextSlot,
    replaceAssignment,
    replacementStep,
    resolveAction,
    saveStep,
    skipStep,
    start,
    steps,
    undo,
  };
}

function retryOperationId(operationIds: Map<string, string>, stepId: string) {
  const operationId = operationIds.get(stepId) ?? crypto.randomUUID();
  operationIds.set(stepId, operationId);
  return operationId;
}

function operationStatus(step: WorkoutStep): WorkoutOperationStatus {
  if (step.status === "skipped") return "skipped";
  if (step.verdict === "win") return "win";
  if (step.fresh_baseline) return "baseline";
  return "completed";
}
