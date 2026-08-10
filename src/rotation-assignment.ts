import {
  EXERCISES,
  WORKOUT_SLOTS,
  categoryFor,
  positionsFor,
  protocolChoices,
  structureChoices,
  type AssignmentPosition,
  type Protocol,
  type TargetSet,
  type WorkoutSlot,
} from "./rotation-config.js";
import { validTargetSets } from "./rotation-assignment-draft.js";

export type Assignment = {
  active: true;
  assignment_id: string;
  body_part: AssignmentPosition;
  exercise: string;
  protocol: Protocol;
  replaced_assignment_id: string | null;
  slot: WorkoutSlot;
  structure: string;
  target_sets: TargetSet[];
};

export function assignmentKey(slot: WorkoutSlot, position: AssignmentPosition) {
  return `${slot}:${position}`;
}

export function isAssignment(value: unknown): value is Assignment {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!hasAssignmentIdentity(row)) return false;
  if (!hasValidExercise(row)) return false;
  if (!hasValidReplacement(row)) return false;
  return hasValidStructure(row);
}

function hasAssignmentIdentity(row: Record<string, unknown>) {
  const position = row.body_part as AssignmentPosition;
  const slot = row.slot as WorkoutSlot;
  return (
    row.active === true &&
    typeof row.assignment_id === "string" &&
    WORKOUT_SLOTS.includes(slot) &&
    positionsFor(slot).includes(position) &&
    typeof row.exercise === "string"
  );
}

function hasValidExercise(row: Record<string, unknown>) {
  const position = row.body_part as AssignmentPosition;
  const exercise = row.exercise as string;
  return (
    (EXERCISES[categoryFor(position)] as readonly string[]).includes(
      exercise,
    ) &&
    protocolChoices(position, exercise).some(
      (choice) => choice.value === row.protocol,
    )
  );
}

function hasValidReplacement(row: Record<string, unknown>) {
  return (
    row.replaced_assignment_id === null ||
    typeof row.replaced_assignment_id === "string"
  );
}

function hasValidStructure(row: Record<string, unknown>) {
  const position = row.body_part as AssignmentPosition;
  const choices = structureChoices(
    position,
    row.exercise as string,
    row.protocol as Protocol,
  );
  if (choices.length === 0) {
    return (
      row.structure === "none" &&
      Array.isArray(row.target_sets) &&
      row.target_sets.length === 0
    );
  }
  const selected = choices.find((choice) => choice.value === row.structure);
  if (!selected || !validTargetSets(row.target_sets)) return false;
  return (
    row.structure === "custom" ||
    sameTargets(row.target_sets, selected.targets ?? [])
  );
}

function sameTargets(left: TargetSet[], right: readonly TargetSet[]) {
  return (
    left.length === right.length &&
    left.every(
      (target, index) =>
        target.min === right[index].min && target.max === right[index].max,
    )
  );
}
