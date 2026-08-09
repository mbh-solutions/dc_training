import { useEffect, useState } from "react";
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
} from "../rotation-config.js";
import { supabase } from "../lib/supabase.js";

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

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function assignmentKey(slot: WorkoutSlot, position: AssignmentPosition) {
  return `${slot}:${position}`;
}

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

function isAssignment(value: unknown): value is Assignment {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    hasAssignmentIdentity(row) &&
    hasValidSelection(row) &&
    hasValidStructure(row) &&
    (row.replaced_assignment_id === null ||
      typeof row.replaced_assignment_id === "string")
  );
}

function hasAssignmentIdentity(row: Record<string, unknown>) {
  return (
    row.active === true &&
    typeof row.assignment_id === "string" &&
    WORKOUT_SLOTS.includes(row.slot as WorkoutSlot) &&
    positionsFor(row.slot as WorkoutSlot).includes(
      row.body_part as AssignmentPosition,
    )
  );
}

function hasValidSelection(row: Record<string, unknown>) {
  const position = row.body_part as AssignmentPosition;
  return (
    typeof row.exercise === "string" &&
    (EXERCISES[categoryFor(position)] as readonly string[]).includes(
      row.exercise,
    ) &&
    protocolChoices(position, row.exercise).some(
      (choice) => choice.value === row.protocol,
    )
  );
}

function hasValidStructure(row: Record<string, unknown>) {
  const choices = structureChoices(
    row.body_part as AssignmentPosition,
    row.exercise as string,
    row.protocol as Protocol,
  );
  if (choices.length === 0)
    return (
      row.structure === "none" &&
      Array.isArray(row.target_sets) &&
      row.target_sets.length === 0
    );
  const selected = choices.find((choice) => choice.value === row.structure);
  return (
    Boolean(selected) &&
    validTargetSets(row.target_sets) &&
    (row.structure === "custom" ||
      JSON.stringify(row.target_sets) === JSON.stringify(selected?.targets))
  );
}

export function useRotationAssignments(userId: string) {
  const [saved, setSaved] = useState<Record<string, Assignment>>({});
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase
      .from("rotation_assignment_versions")
      .select(
        "assignment_id,replaced_assignment_id,active,slot,body_part,exercise,protocol,structure,target_sets",
      )
      .eq("user_id", userId)
      .eq("active", true)
      .then(({ data, error }) => {
        if (!active) return;
        if (
          error ||
          !Array.isArray(data) ||
          data.some((row) => !isAssignment(row))
        ) {
          setMessage("ASSIGNMENTS COULD NOT BE LOADED");
          setLoadState("failed");
          return;
        }
        setSaved(
          Object.fromEntries(
            data.map((row) => [assignmentKey(row.slot, row.body_part), row]),
          ),
        );
        setLoadState("ready");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const saveAssignment = async (
    slot: WorkoutSlot,
    bodyPart: AssignmentPosition,
    exercise: string,
    protocol: Protocol,
    structure: string,
    targetSets: TargetSet[],
  ) => {
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase!.rpc("save_rotation_assignment", {
      p_body_part: bodyPart,
      p_exercise: exercise,
      p_protocol: protocol,
      p_slot: slot,
      p_structure: structure,
      p_target_sets: targetSets,
    });
    setSaving(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !isAssignment(row)) {
      setMessage("ASSIGNMENT COULD NOT BE SAVED");
      return false;
    }
    setSaved((current) => ({
      ...current,
      [assignmentKey(slot, bodyPart)]: row,
    }));
    return true;
  };

  return { loadState, message, saveAssignment, saved, saving };
}
