import { useCallback, useEffect, useRef, useState } from "react";
import type { Workout, WorkoutStep } from "../workout-domain.js";
import {
  loadWorkoutState,
  saveA1WorkoutStep,
  startA1Workout,
  undoA1WorkoutStep,
} from "../workout-api.js";
import type { WeightEntry } from "../weight-conversion.js";
import type { WorkoutSlot } from "../rotation-config.js";

export function useWorkout(userId: string, online: boolean) {
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(
    null,
  );
  const [lastCompletedSlot, setLastCompletedSlot] =
    useState<WorkoutSlot | null>(null);
  const [lastOperationId, setLastOperationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [nextSlot, setNextSlot] = useState<WorkoutSlot>("A1");
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
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
    const result = await startA1Workout(operationId);
    if (!result.data) {
      setMessage(
        result.error.includes("five saved assignments")
          ? "FINISH ALL FIVE A1 ASSIGNMENTS IN ROTATION SETUP"
          : "A1 WORKOUT COULD NOT BE STARTED",
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
  ) => {
    const operationId = retryOperationId(
      pendingOperationIds.current,
      step.step_id,
    );
    const response = await saveA1WorkoutStep(operationId, step, weights, reps);
    if (!response.data) {
      setMessage(response.error);
      return false;
    }
    const result = response.data;
    pendingOperationIds.current.delete(step.step_id);
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
      setLastOperationId(null);
    } else {
      setLastOperationId(operationId);
    }
    return true;
  };

  const undo = async () => {
    if (!lastOperationId) return;
    const result = await undoA1WorkoutStep(lastOperationId);
    if (!result.data) {
      setMessage(result.error);
      return;
    }
    setSteps((current) =>
      current.map((item) =>
        item.step_id === result.data!.step_id ? result.data! : item,
      ),
    );
    setLastOperationId(null);
    setMessage("");
  };

  return {
    activeWorkout,
    completedWorkout,
    dismissCompleted: () => setCompletedWorkout(null),
    lastCompletedSlot,
    lastOperationId,
    loading,
    message,
    nextSlot,
    saveStep,
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
