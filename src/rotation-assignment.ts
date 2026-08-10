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
  const position = row.body_part as AssignmentPosition;
  const slot = row.slot as WorkoutSlot;
  if (
    row.active !== true ||
    typeof row.assignment_id !== "string" ||
    !WORKOUT_SLOTS.includes(slot) ||
    !positionsFor(slot).includes(position) ||
    typeof row.exercise !== "string" ||
    !(EXERCISES[categoryFor(position)] as readonly string[]).includes(
      row.exercise,
    ) ||
    !protocolChoices(position, row.exercise).some(
      (choice) => choice.value === row.protocol,
    ) ||
    !(
      row.replaced_assignment_id === null ||
      typeof row.replaced_assignment_id === "string"
    )
  )
    return false;

  const choices = structureChoices(
    position,
    row.exercise,
    row.protocol as Protocol,
  );
  const selected = choices.find((choice) => choice.value === row.structure);
  const structureValid =
    choices.length === 0
      ? row.structure === "none" &&
        Array.isArray(row.target_sets) &&
        row.target_sets.length === 0
      : Boolean(selected) &&
        validTargetSets(row.target_sets) &&
        (row.structure === "custom" ||
          JSON.stringify(row.target_sets) === JSON.stringify(selected?.targets));

  return structureValid;
}
