import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/logbook-domain.ts", import.meta.url),
  "utf8",
)
  .replace('import type { TargetSet } from "./rotation-config.js";', "")
  .replace('import type { WeightEntry } from "./weight-conversion.js";', "");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { compareLogbookPerformance } = await import(
  `data:text/javascript,${encodeURIComponent(javascript)}`
);

const weight = (micrograms) => ({
  amount: micrograms,
  micrograms,
  unit: "lb",
});
const performance = (weights, reps, durationSeconds = null) => ({
  durationSeconds,
  reps,
  weights: weights.map((value) => weight(String(value))),
});
const compare = ({
  bodyPart = "chest",
  current,
  previous,
  protocol = "rest_pause",
  targetSets = [{ min: 11, max: 15 }],
}) =>
  compareLogbookPerformance({
    bodyPart,
    current,
    previous,
    protocol,
    targetSets,
  });

test("locked verdict truth tables stay deterministic at boundaries and retries", () => {
  const cases = [
    {
      name: "new assignment is baseline",
      input: { current: performance([100], [8, 4, 2]), previous: null },
      expected: { setVerdicts: [], verdict: "baseline" },
    },
    {
      name: "rest-pause same load more total wins",
      input: {
        current: performance([100], [9, 3, 3]),
        previous: performance([100], [8, 4, 2]),
      },
      expected: { setVerdicts: [], verdict: "win" },
    },
    {
      name: "rest-pause distribution does not matter",
      input: {
        current: performance([100], [7, 7, 1]),
        previous: performance([100], [8, 4, 2]),
      },
      expected: { setVerdicts: [], verdict: "win" },
    },
    {
      name: "rest-pause heavier at lower target boundary wins",
      input: {
        current: performance([101], [6, 3, 2]),
        previous: performance([100], [8, 4, 2]),
      },
      expected: { setVerdicts: [], verdict: "win" },
    },
    {
      name: "rest-pause heavier below target fails",
      input: {
        current: performance([101], [5, 3, 2]),
        previous: performance([100], [8, 4, 2]),
      },
      expected: { setVerdicts: [], verdict: "failure" },
    },
    {
      name: "rest-pause exact tie fails",
      input: {
        current: performance([100], [9, 3, 2]),
        previous: performance([100], [8, 4, 2]),
      },
      expected: { setVerdicts: [], verdict: "failure" },
    },
    {
      name: "one straight-set win makes overall win",
      input: {
        protocol: "straight_set",
        targetSets: [
          { min: 6, max: 8 },
          { min: 10, max: 12 },
        ],
        current: performance([101, 90], [8, 9]),
        previous: performance([100, 90], [8, 10]),
      },
      expected: { setVerdicts: ["win", "failure"], verdict: "win" },
    },
    {
      name: "straight-set ties are not wins",
      input: {
        protocol: "straight_set",
        targetSets: [
          { min: 6, max: 8 },
          { min: 10, max: 12 },
        ],
        current: performance([100, 90], [8, 10]),
        previous: performance([100, 90], [8, 10]),
      },
      expected: { setVerdicts: ["tie", "tie"], verdict: "failure" },
    },
    {
      name: "straight-set heavier above range fails",
      input: {
        protocol: "straight_set",
        targetSets: [{ min: 6, max: 8 }],
        current: performance([101], [9]),
        previous: performance([100], [8]),
      },
      expected: { setVerdicts: ["failure"], verdict: "failure" },
    },
    {
      name: "abs same load more metric wins",
      input: {
        bodyPart: "abs_1",
        protocol: "straight_set",
        targetSets: [],
        current: performance([50], [21]),
        previous: performance([50], [20]),
      },
      expected: { setVerdicts: [], verdict: "win" },
    },
    {
      name: "abs same load tie fails",
      input: {
        bodyPart: "abs_1",
        protocol: "straight_set",
        targetSets: [],
        current: performance([50], [20]),
        previous: performance([50], [20]),
      },
      expected: { setVerdicts: [], verdict: "failure" },
    },
    {
      name: "abs heavier with lower metric is ambiguous",
      input: {
        bodyPart: "abs_1",
        protocol: "straight_set",
        targetSets: [],
        current: performance([51], [19]),
        previous: performance([50], [20]),
      },
      expected: { setVerdicts: [], verdict: "ambiguous" },
    },
    {
      name: "abs lighter with higher timed metric is ambiguous",
      input: {
        bodyPart: "abs_2",
        protocol: "timed_hold",
        targetSets: [],
        current: performance([24], [], 61),
        previous: performance([25], [], 60),
      },
      expected: { setVerdicts: [], verdict: "ambiguous" },
    },
  ];

  for (const { expected, input, name } of cases) {
    const first = compare(input);
    assert.deepEqual(first, expected, name);
    assert.deepEqual(compare(input), first, `${name} retry`);
  }
});
