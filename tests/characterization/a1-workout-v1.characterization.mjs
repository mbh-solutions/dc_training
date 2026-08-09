import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const workoutTracerExists = existsSync(
  path.join(target, "src/WorkoutTracer.tsx"),
);
const baselineMarker = "tests/characterization/a1-workout-v1.baseline";
const initialBase =
  existsSync(path.join(target, baselineMarker)) &&
  !existsSync(
    path.join(
      process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ?? process.cwd(),
      baselineMarker,
    ),
  );
const sourceContains = (relativePath, tokens) => {
  const source = readFileSync(path.join(target, relativePath), "utf8");
  return tokens.every((token) => source.includes(token));
};
const surfaceContract = workoutTracerExists
  ? sourceContains("src/WorkoutTracer.tsx", [
      "export function WorkoutTracer",
      "export function WorkoutComplete",
    ]) &&
    sourceContains("src/hooks/use-workout.ts", [
      "start_a1_workout",
      "save_a1_workout_step",
      "undo_a1_workout_step",
    ]) &&
    sourceContains("src/workout-domain.ts", ["226796185n", "250000000n"]) &&
    sourceContains("src/index.css", [".rotation-tracker", ".last-workout"])
  : initialBase &&
    sourceContains("tests/a1-assignment.e2e.mjs", ["a1_assignment_round_trip"]);

process.stdout.write(
  JSON.stringify({
    behavior: { a1_surface_contract: surfaceContract === true },
    scenario: "a1-workout-v1",
    schema_version: "1.0",
  }),
);
