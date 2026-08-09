import { useState } from "react";
import {
  structureChoices,
  type AssignmentPosition,
  type Protocol,
  type WorkoutSlot,
} from "../rotation-config.js";
import {
  draftTargets,
  type DraftTarget,
} from "../rotation-assignment-draft.js";
import { assignmentKey, type Assignment } from "./use-rotation-assignment.js";

const emptyTargets = (): DraftTarget[] => [{ min: "", max: "" }];

export function useRotationEditor(saved: Record<string, Assignment>) {
  const [slot, setSlot] = useState<WorkoutSlot>("A1");
  const [position, setPosition] = useState<AssignmentPosition>("chest");
  const [exercise, setExercise] = useState("");
  const [protocol, setProtocol] = useState<Protocol | "">("");
  const [structure, setStructure] = useState("");
  const [customTargets, setCustomTargets] = useState<DraftTarget[]>(emptyTargets);
  const [showProtocolInfo, setShowProtocolInfo] = useState(false);

  const resetDownstream = () => {
    setProtocol("");
    setStructure("");
    setCustomTargets(emptyTargets());
    setShowProtocolInfo(false);
  };

  const editAssignment = (
    nextSlot: WorkoutSlot,
    nextPosition: AssignmentPosition,
  ) => {
    setSlot(nextSlot);
    setPosition(nextPosition);
    const current = saved[assignmentKey(nextSlot, nextPosition)];
    setExercise(current?.exercise ?? "");
    setProtocol(current?.protocol ?? "");
    setStructure(current?.structure === "none" ? "" : (current?.structure ?? ""));
    setCustomTargets(
      current?.structure === "custom"
        ? draftTargets(current.target_sets)
        : emptyTargets(),
    );
    setShowProtocolInfo(false);
  };

  const selectExercise = (next: string) => {
    if (next !== exercise) resetDownstream();
    setExercise(next);
  };

  const selectProtocol = (next: Protocol) => {
    if (next !== protocol) {
      setStructure("");
      setCustomTargets(emptyTargets());
    }
    setProtocol(next);
  };

  const selectStructure = (next: string) => {
    setStructure(next);
    const preset = structureChoices(
      position,
      exercise,
      protocol as Protocol,
    ).find((choice) => choice.value === next);
    setCustomTargets(
      next === "custom" ? emptyTargets() : draftTargets(preset?.targets ?? []),
    );
  };

  const setCustomSetCount = (count: number) => {
    const bounded = Math.max(1, Math.min(10, count || 1));
    setCustomTargets((current) =>
      Array.from(
        { length: protocol === "rest_pause" ? 1 : bounded },
        (_, index) => current[index] ?? { min: "", max: "" },
      ),
    );
  };

  const updateCustomTarget = (
    index: number,
    field: keyof DraftTarget,
    value: string,
  ) => {
    setCustomTargets((current) =>
      current.map((target, targetIndex) =>
        targetIndex === index ? { ...target, [field]: value } : target,
      ),
    );
  };

  return {
    customTargets,
    editAssignment,
    exercise,
    position,
    protocol,
    selectExercise,
    selectProtocol,
    selectStructure,
    setCustomSetCount,
    setShowProtocolInfo,
    showProtocolInfo,
    slot,
    structure,
    updateCustomTarget,
  };
}
