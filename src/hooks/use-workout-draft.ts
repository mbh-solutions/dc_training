import { useRef, useState } from "react";
import type { WeightEntry } from "../weight-conversion.js";

type Draft = { weights: WeightEntry[]; values: string[] };

export function useWorkoutDraft(
  key: string,
  initial: () => Draft,
  enabled: boolean,
) {
  const [storageKey] = useState(key);
  const [draft, setDraft] = useState<Draft>(() => {
    const fallback = initial();
    if (!enabled) return fallback;
    try {
      const stored = JSON.parse(
        window.window.localStorage.getItem(storageKey) ?? "null",
      );
      if (isStoredDraft(stored, fallback)) return stored;
    } catch {
      /* A damaged or unavailable draft must not block training. */
    }
    return fallback;
  });
  const latest = useRef(draft);
  const [notice, setNotice] = useState("");
  const update = <K extends keyof Draft>(
    field: K,
    value: Draft[K] | ((current: Draft[K]) => Draft[K]),
  ) => {
    const next = {
      ...latest.current,
      [field]:
        typeof value === "function" ? value(latest.current[field]) : value,
    };
    latest.current = next;
    setDraft(next);
    if (!enabled) return;
    try {
      window.window.localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice("Draft saved on this device");
    } catch {
      setNotice(
        "Draft could not be saved. Keep this workout open until you save the set.",
      );
    }
  };
  const clear = () => {
    try {
      window.window.localStorage.removeItem(storageKey);
    } catch {
      /* Storage may be disabled. */
    }
  };
  return {
    ...draft,
    notice,
    clear,
    setWeights: (
      value:
        | Draft["weights"]
        | ((current: Draft["weights"]) => Draft["weights"]),
    ) => update("weights", value),
    setValues: (
      value: Draft["values"] | ((current: Draft["values"]) => Draft["values"]),
    ) => update("values", value),
  };
}

function isStoredDraft(stored: Draft | null, fallback: Draft): stored is Draft {
  if (
    !stored ||
    !Array.isArray(stored.values) ||
    !Array.isArray(stored.weights)
  )
    return false;
  return (
    stored.values.length === fallback.values.length &&
    stored.weights.length === fallback.weights.length &&
    stored.values.every((value) => typeof value === "string") &&
    stored.weights.every(validStoredWeight)
  );
}
function validStoredWeight(entry: WeightEntry) {
  return (
    entry &&
    typeof entry.amount === "string" &&
    ["lb", "kg"].includes(entry.unit) &&
    [undefined, "weight", "body_weight", "bar", "band"].includes(entry.kind)
  );
}
