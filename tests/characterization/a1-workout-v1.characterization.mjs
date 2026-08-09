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
const tokenize = (source) => {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    const comment = /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (comment) {
      index += comment[0].length;
      continue;
    }
    const token =
      /^(?:\s+|[A-Za-z_$][\w$]*|\d+n?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|.)/.exec(
        rest,
      )[0];
    index += token.length;
    if (!/^\s+$/.test(token)) tokens.push(token);
  }
  return tokens;
};
const hasSequence = (tokens, expected) =>
  tokens.some((_, index) =>
    expected.every((token, offset) => tokens[index + offset] === token),
  );
const sourceHasSequences = (relativePath, sequences) => {
  const tokens = tokenize(
    readFileSync(path.join(target, relativePath), "utf8"),
  );
  return sequences.every((sequence) => hasSequence(tokens, sequence));
};
const tokenizerRejectsComments = !hasSequence(
  tokenize("/* export function Spoof() {} */"),
  ["export", "function", "Spoof", "("],
);
const surfaceContract = workoutTracerExists
  ? tokenizerRejectsComments &&
    sourceHasSequences("src/WorkoutTracer.tsx", [
      ["export", "function", "WorkoutTracer", "("],
      ["export", "function", "WorkoutComplete", "("],
    ]) &&
    sourceHasSequences("src/hooks/use-workout.ts", [
      [".", "rpc", "(", '"start_a1_workout"'],
      [".", "rpc", "(", '"save_a1_workout_step"'],
      [".", "rpc", "(", '"undo_a1_workout_step"'],
    ]) &&
    sourceHasSequences("src/workout-domain.ts", [
      ["226796185n"],
      ["250000000n"],
    ]) &&
    sourceHasSequences("src/index.css", [
      [".", "rotation-tracker", ","],
      [".", "last-workout", "{"],
    ])
  : initialBase &&
    tokenizerRejectsComments &&
    sourceHasSequences("tests/a1-assignment.e2e.mjs", [
      ["a1_assignment_round_trip", ":"],
    ]);

process.stdout.write(
  JSON.stringify({
    behavior: { a1_surface_contract: surfaceContract === true },
    scenario: "a1-workout-v1",
    schema_version: "1.0",
  }),
);
