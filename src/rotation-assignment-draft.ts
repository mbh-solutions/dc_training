import {
  structureChoices,
  type AssignmentPosition,
  type Protocol,
  type TargetSet,
} from "./rotation-config.js";

export type DraftTarget = { max: string; min: string };

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function validTargetSets(value: unknown): value is TargetSet[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every(
      (target) =>
        target &&
        typeof target === "object" &&
        Number.isInteger((target as TargetSet).min) &&
        Number.isInteger((target as TargetSet).max) &&
        (target as TargetSet).min > 0 &&
        (target as TargetSet).min <= POSTGRES_INTEGER_MAX &&
        (target as TargetSet).max <= POSTGRES_INTEGER_MAX &&
        (target as TargetSet).max >= (target as TargetSet).min,
    )
  );
}

export function draftTargets(targets: readonly TargetSet[]): DraftTarget[] {
  return targets.map(({ min, max }) => ({
    min: String(min),
    max: String(max),
  }));
}

export function resolveAssignmentDraft(
  position: AssignmentPosition,
  exercise: string,
  protocol: Protocol | "",
  structure: string,
  customTargets: readonly DraftTarget[],
) {
  const availableStructures = protocol
    ? structureChoices(position, exercise, protocol)
    : [];
  const selectedStructure = availableStructures.find(
    (choice) => choice.value === structure,
  );
  const targets =
    structure === "custom"
      ? customTargets.map(({ min, max }) => ({
          min: Number(min),
          max: Number(max),
        }))
      : [...(selectedStructure?.targets ?? [])];

  return {
    availableStructures,
    targets,
    structureValid:
      availableStructures.length === 0 ||
      (Boolean(selectedStructure) &&
        (structure !== "custom" || validTargetSets(targets))),
  };
}
