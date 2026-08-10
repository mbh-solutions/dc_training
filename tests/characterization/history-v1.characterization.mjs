import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const historyScreenExists = existsSync(
  path.join(target, "src/HistoryScreen.tsx"),
);

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
    if ("\n\r".includes(source[index])) return 1;
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

const spoof = ["export", "default", "function", "HistoryScreen", "("];
const tokenizerRejectsSpoofs = [
  "/* export default function HistoryScreen() {} */",
  "`export default function HistoryScreen() {}`",
  "/export default function HistoryScreen\\(/",
].every((source) => !hasSequence(tokenize(source), spoof));

const predecessorContract =
  !historyScreenExists &&
  sourceHasSequences(
    "supabase/migrations/20260810100806_enforce_logbook_rules.sql",
    [
      [
        "create",
        "or",
        "replace",
        "function",
        "public",
        ".",
        "correct_workout_performance",
        "(",
      ],
      ["grant", "execute", "on", "function"],
    ],
  );

const historyContract =
  historyScreenExists &&
  sourceHasSequences("src/HistoryScreen.tsx", [
    ["export", "default", "function", "HistoryScreen", "("],
    ["role", "=", '"tab"'],
    ["<", "svg"],
    ["correctHistoryPerformance", "("],
  ]) &&
  sourceHasSequences("src/workout-api.ts", [
    ["export", "async", "function", "loadHistoryState", "("],
    ["export", "async", "function", "correctHistoryPerformance", "("],
    [".", "rpc", "(", '"correct_workout_performance"'],
  ]) &&
  sourceHasSequences("tests/a1-assignment.e2e.mjs", [
    ["history_runtime", ":", "historyRuntime"],
  ]);

process.stdout.write(
  JSON.stringify({
    behavior: {
      history_surface_contract:
        tokenizerRejectsSpoofs && (predecessorContract || historyContract),
    },
    scenario: "history-v1",
    schema_version: "1.0",
  }),
);
