import type { TargetSet } from "./rotation-config.js";
import type { WeightEntry } from "./weight-conversion.js";

export type LogbookVerdict = "ambiguous" | "baseline" | "failure" | "win";
export type SetVerdict = "failure" | "tie" | "win";

export type LogbookPerformance = {
  durationSeconds: number | null;
  reps: number[];
  weights: WeightEntry[];
};

export type LogbookComparison = {
  setVerdicts: SetVerdict[];
  verdict: LogbookVerdict;
};

export function compareLogbookPerformance({
  bodyPart,
  current,
  previous,
  protocol,
  targetSets,
}: {
  bodyPart: string;
  current: LogbookPerformance;
  previous: LogbookPerformance | null;
  protocol: "rest_pause" | "straight_set" | "timed_hold";
  targetSets: TargetSet[];
}): LogbookComparison {
  if (!previous || previous.weights.length === 0)
    return { setVerdicts: [], verdict: "baseline" };
  if (bodyPart === "abs_1" || bodyPart === "abs_2")
    return compareAbs(current, previous, protocol);
  if (protocol === "rest_pause")
    return compareRestPause(current, previous, targetSets[0]);
  return compareStraightSets(current, previous, targetSets);
}

function compareAbs(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  protocol: "rest_pause" | "straight_set" | "timed_hold",
): LogbookComparison {
  const weight = compareWeight(current.weights[0], previous.weights[0]);
  const currentMetric =
    protocol === "timed_hold" ? current.durationSeconds! : current.reps[0];
  const previousMetric =
    protocol === "timed_hold" ? previous.durationSeconds! : previous.reps[0];
  const metric = Math.sign(currentMetric - previousMetric);
  if ((weight === 0 && metric > 0) || (weight > 0 && metric >= 0))
    return { setVerdicts: [], verdict: "win" };
  if ((weight === 0 && metric <= 0) || (weight < 0 && metric <= 0))
    return { setVerdicts: [], verdict: "failure" };
  return { setVerdicts: [], verdict: "ambiguous" };
}

function compareRestPause(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  target: TargetSet,
): LogbookComparison {
  const weight = compareWeight(current.weights[0], previous.weights[0]);
  const total = sum(current.reps);
  const previousTotal = sum(previous.reps);
  const win =
    (weight > 0 && total >= target.min && total <= target.max) ||
    (weight === 0 && total > previousTotal);
  return { setVerdicts: [], verdict: win ? "win" : "failure" };
}

function compareStraightSets(
  current: LogbookPerformance,
  previous: LogbookPerformance,
  targets: TargetSet[],
): LogbookComparison {
  const setVerdicts = current.weights.map((weight, index) => {
    const weightResult = compareWeight(weight, previous.weights[index]);
    const reps = current.reps[index];
    const previousReps = previous.reps[index];
    const target = targets[index] ?? { min: 1, max: 2_147_483_647 };
    if (
      (weightResult > 0 && reps >= target.min && reps <= target.max) ||
      (weightResult === 0 && reps > previousReps)
    )
      return "win";
    if (weightResult === 0 && reps === previousReps) return "tie";
    return "failure";
  });
  return {
    setVerdicts,
    verdict: setVerdicts.includes("win") ? "win" : "failure",
  };
}

function compareWeight(current: WeightEntry, previous: WeightEntry) {
  const difference = BigInt(current.micrograms!) - BigInt(previous.micrograms!);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
