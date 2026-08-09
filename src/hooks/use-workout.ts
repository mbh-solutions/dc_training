import { useCallback, useEffect, useState } from "react";
import type { WorkoutSlot } from "../rotation-config.js";
import {
  validWorkout,
  validWorkoutStep,
  type WeightEntry,
  type Workout,
  type WorkoutStep,
} from "../workout-domain.js";
import { supabase } from "../lib/supabase.js";

type SaveResult = {
  completed_now?: boolean;
  next_slot: WorkoutSlot;
  step: WorkoutStep;
  workout: Workout;
};

async function fetchWorkoutState(userId: string) {
  return Promise.all([
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
}

async function fetchWorkoutSteps(userId: string, workoutId: string) {
  return supabase!
    .from("workout_steps")
    .select(
      "step_id,workout_id,ordinal,kind,body_part,exercise,protocol,structure,target_sets,status,weight_entries,reps",
    )
    .eq("user_id", userId)
    .eq("workout_id", workoutId)
    .order("ordinal");
}

function validStepRows(result: { data: unknown; error: unknown }) {
  return (
    !result.error &&
    Array.isArray(result.data) &&
    result.data.every(validWorkoutStep)
  );
}

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

  const load = useCallback(async () => {
    if (!supabase || !online) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [rotationResult, workoutResult] = await fetchWorkoutState(userId);
    if (rotationResult.error || workoutResult.error) {
      setMessage("WORKOUT STATE COULD NOT BE LOADED");
      setLoading(false);
      return;
    }
    const rotation = rotationResult.data as Record<string, unknown> | null;
    setNextSlot((rotation?.next_slot as WorkoutSlot) ?? "A1");
    setLastCompletedSlot(
      (rotation?.last_completed_slot as WorkoutSlot | null) ?? null,
    );
    const workout = validWorkout(workoutResult.data)
      ? workoutResult.data
      : null;
    setActiveWorkout(workout);
    if (!workout) {
      setSteps([]);
      setLoading(false);
      return;
    }
    const stepResult = await fetchWorkoutSteps(userId, workout.workout_id);
    if (!validStepRows(stepResult)) {
      setMessage("WORKOUT STEPS COULD NOT BE LOADED");
    } else {
      setSteps(stepResult.data as WorkoutStep[]);
      setMessage("");
    }
    setLoading(false);
  }, [online, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setMessage("");
    const operationId = crypto.randomUUID();
    const { data, error } = await supabase!.rpc("start_a1_workout", {
      p_operation_id: operationId,
    });
    if (error || !validWorkout(data)) {
      setMessage(
        error?.message.includes("five saved assignments")
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
    status: "completed" | "skipped",
    weights: WeightEntry[] = [],
    reps: number[] = [],
  ) => {
    const operationId = crypto.randomUUID();
    const { data, error } = await supabase!.rpc("save_a1_workout_step", {
      p_operation_id: operationId,
      p_reps: reps,
      p_status: status,
      p_step_id: step.step_id,
      p_weights: weights,
    });
    const result = data as SaveResult | null;
    if (
      error ||
      !result ||
      !validWorkout(result.workout) ||
      !validWorkoutStep(result.step)
    ) {
      setMessage(error?.message ?? "STEP COULD NOT BE SAVED");
      return false;
    }
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
    const { data, error } = await supabase!.rpc("undo_a1_workout_step", {
      p_operation_id: lastOperationId,
      p_undo_operation_id: crypto.randomUUID(),
    });
    if (error || !validWorkoutStep(data)) {
      setMessage("UNDO COULD NOT BE SAVED");
      return;
    }
    setSteps((current) =>
      current.map((item) => (item.step_id === data.step_id ? data : item)),
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
