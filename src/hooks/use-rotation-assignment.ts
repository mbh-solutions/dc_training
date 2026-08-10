import { useRef, useState } from "react";
import type { OfflineAccountState } from "../offline-sync.js";
import type { CommitOperation } from "./use-workout.js";
import type {
  AssignmentPosition,
  Protocol,
  TargetSet,
  WorkoutSlot,
} from "../rotation-config.js";
export { assignmentKey, type Assignment } from "../rotation-assignment.js";

export function useRotationAssignments(
  accountState: OfflineAccountState | null,
  commitOperation: CommitOperation,
) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const operationIds = useRef(new Map<string, string>());

  const saveAssignment = async (
    slot: WorkoutSlot,
    bodyPart: AssignmentPosition,
    exercise: string,
    protocol: Protocol,
    structure: string,
    targetSets: TargetSet[],
  ) => {
    const key = `${slot}:${bodyPart}`;
    const operationId = operationIds.current.get(key) ?? crypto.randomUUID();
    operationIds.current.set(key, operationId);
    setSaving(true);
    setMessage("");
    const result = await commitOperation({
      id: operationId,
      kind: "save_rotation_assignment",
      payload: {
        body_part: bodyPart,
        exercise,
        protocol,
        slot,
        structure,
        target_sets: targetSets,
      },
    });
    setSaving(false);
    if (!result.data) {
      setMessage(result.error || "ASSIGNMENT COULD NOT BE SAVED");
      return false;
    }
    operationIds.current.delete(key);
    setMessage("ASSIGNMENT SAVED ON DEVICE");
    return true;
  };

  return {
    loadState: accountState ? ("ready" as const) : ("loading" as const),
    message,
    saveAssignment,
    saved: accountState?.assignments ?? {},
    saving,
  };
}
