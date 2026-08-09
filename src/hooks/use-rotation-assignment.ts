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
  if (
    row.active !== true ||
    typeof row.assignment_id !== "string" ||
    !WORKOUT_SLOTS.includes(row.slot as WorkoutSlot) ||
    !positionsFor(row.slot as WorkoutSlot).includes(
      row.body_part as AssignmentPosition,
    )
  )
    return false;
  const position = row.body_part as AssignmentPosition;
  const exercise = row.exercise as string;
  const protocol = row.protocol as Protocol;
  const structure = row.structure as string;
  const targets = row.target_sets;
  const choices = structureChoices(position, exercise, protocol);
  const selected = choices.find((choice) => choice.value === structure);
  return (
    typeof exercise === "string" &&
    (EXERCISES[categoryFor(position)] as readonly string[]).includes(
      exercise,
    ) &&
    protocolChoices(position, exercise).some(
      (choice) => choice.value === protocol,
    ) &&
    (choices.length === 0
      ? structure === "none" && Array.isArray(targets) && targets.length === 0
      : Boolean(selected) &&
        validTargetSets(targets) &&
        (structure === "custom" ||
          JSON.stringify(targets) === JSON.stringify(selected?.targets))) &&
    (row.replaced_assignment_id === null ||
      typeof row.replaced_assignment_id === "string")
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
