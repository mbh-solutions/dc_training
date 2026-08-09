import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export const CHEST_EXERCISES = [
  "Incline barbell press",
  "Flat barbell press",
  "Decline barbell press",
  "Incline football-bar press",
  "Flat football-bar press",
  "Decline football-bar press",
  "Incline dumbbell press",
  "Flat dumbbell press",
  "Decline dumbbell press",
] as const;

export type Protocol = "rest_pause" | "straight_set";

export type Assignment = {
  body_part: "chest";
  exercise: (typeof CHEST_EXERCISES)[number];
  protocol: Protocol;
  slot: "A1";
  target_max: number | null;
  target_min: number | null;
};

function hasFixedA1Fields(assignment: Record<string, unknown>) {
  return (
    assignment.slot === "A1" &&
    assignment.body_part === "chest" &&
    typeof assignment.exercise === "string" &&
    CHEST_EXERCISES.includes(
      assignment.exercise as (typeof CHEST_EXERCISES)[number],
    )
  );
}

function hasValidTargets(assignment: Record<string, unknown>) {
  if (assignment.protocol === "straight_set")
    return assignment.target_min === null && assignment.target_max === null;
  return (
    assignment.protocol === "rest_pause" &&
    Number.isInteger(assignment.target_min) &&
    Number.isInteger(assignment.target_max) &&
    Number(assignment.target_min) > 0 &&
    Number(assignment.target_min) <= 2_147_483_647 &&
    Number(assignment.target_max) <= 2_147_483_647 &&
    Number(assignment.target_max) >= Number(assignment.target_min)
  );
}

function isAssignment(value: unknown): value is Assignment {
  if (!value || typeof value !== "object") return false;
  const assignment = value as Record<string, unknown>;
  return hasFixedA1Fields(assignment) && hasValidTargets(assignment);
}

export function useRotationAssignment(userId: string) {
  const [saved, setSaved] = useState<Assignment | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      ?.from("rotation_assignments")
      .select("slot,body_part,exercise,protocol,target_min,target_max")
      .eq("user_id", userId)
      .eq("slot", "A1")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || (data && !isAssignment(data))) {
          setMessage("ASSIGNMENT COULD NOT BE LOADED");
          setLoadState("failed");
          return;
        }
        if (data) setSaved(data);
        setLoadState("ready");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const saveAssignment = async (assignment: Assignment) => {
    setSaving(true);
    setMessage("");
    const { error } = await supabase!.from("rotation_assignments").upsert(
      {
        ...assignment,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,slot" },
    );
    setSaving(false);
    if (error) {
      setMessage("ASSIGNMENT COULD NOT BE SAVED");
      return false;
    }
    setSaved(assignment);
    return true;
  };

  return { loadState, message, saved, saveAssignment, saving };
}
