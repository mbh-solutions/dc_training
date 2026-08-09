import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const write = process.stdout.write.bind(process.stdout);
let captured = "";

process.stdout.write = (chunk) => {
  captured += String(chunk);
  return true;
};

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();

try {
  await import(
    pathToFileURL(path.join(target, "tests/a1-assignment.e2e.mjs")).href
  );
} finally {
  process.stdout.write = write;
}

const result = JSON.parse(captured);
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
const runtimeContract = workoutTracerExists
  ? result.behavior.a1_workout_completion
  : initialBase
    ? result.behavior.a1_assignment_round_trip
    : false;

write(
  JSON.stringify({
    behavior: { a1_runtime_contract: runtimeContract === true },
    scenario: "a1-workout-v1",
    schema_version: "1.0",
  }),
);
