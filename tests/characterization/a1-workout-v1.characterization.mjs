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
    if (rest[0] === "`") {
      index += quotedLength(rest, "`");
      tokens.push("template");
      continue;
    }
    if (rest[0] === "/") {
      const length = regexLength(rest);
      if (length > 1) {
        index += length;
        tokens.push("regex");
        continue;
      }
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
const quotedLength = (source, quote) => {
  for (let index = 1; index < source.length; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === quote) return index + 1;
  }
  return source.length;
};
const regexLength = (source) => {
  let inClass = false;
  for (let index = 1; index < source.length; index += 1) {
    if (source[index] === "\n" || source[index] === "\r") return 1;
    if (source[index] === "\\") index += 1;
    else if (source[index] === "[") inClass = true;
    else if (source[index] === "]") inClass = false;
    else if (source[index] === "/" && !inClass) {
      while (/[a-z]/i.test(source[index + 1] ?? "")) index += 1;
      return index + 1;
    }
  }
  return 1;
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
const spoof = ["export", "function", "Spoof", "("];
const tokenizerRejectsSpoofs = [
  "/* export function Spoof() {} */",
  "`export function Spoof() {}`",
  "/export function Spoof\\(/",
].every((source) => !hasSequence(tokenize(source), spoof));
const surfaceContract = workoutTracerExists
  ? tokenizerRejectsSpoofs &&
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
    sourceHasSequences("src/HomeScreen.tsx", [
      ["const", "homeStyles", "=", "[", '".rotation-tracker,"'],
      ["<", "style", ">", "{", "homeStyles", "}", "<", "/", "style", ">"],
    ])
  : initialBase &&
    tokenizerRejectsSpoofs &&
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
