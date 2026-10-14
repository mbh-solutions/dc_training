import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL &&
      (specifier.endsWith(".js") || specifier.endsWith(".jsx"))
    ) {
      const sourceExtension = specifier.endsWith(".jsx") ? ".tsx" : ".ts";
      const candidate = new URL(
        specifier.replace(/\.jsx?$/, sourceExtension),
        context.parentURL,
      );
      if (existsSync(fileURLToPath(candidate))) {
        return { shortCircuit: true, url: candidate.href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "" };
    }
    if (url.endsWith(".ts") || url.endsWith(".tsx")) {
      const fileName = fileURLToPath(url);
      const source = readFileSync(fileName, "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            inlineSourceMap: true,
            inlineSources: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
          fileName,
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://dc-training.test/",
});
Object.assign(globalThis, {
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  Node: dom.window.Node,
  window: dom.window,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const { reduceOfflineState, startWorkoutPayload } =
  await import("../src/offline-sync.ts");
const { positionsFor, structureChoices, protocolChoices } =
  await import("../src/rotation-config.ts");
const { isAssignment } = await import("../src/rotation-assignment.ts");
const { resolveAssignmentDraft } =
  await import("../src/rotation-assignment-draft.ts");
const { WorkoutTracer } = await import("../src/WorkoutTracer.tsx");
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
let sequence = 0;
const operation = (kind, payload) => ({
  id: `operation-${++sequence}`,
  kind,
  payload,
  createdAt: Date.now() + sequence,
  sequence,
  userId: "owner",
  baseRevision: 0,
});
function account() {
  const definitions = [
    [
      "biceps",
      "Straight-bar curl",
      "rest_pause",
      "11-15",
      [{ min: 11, max: 15 }],
    ],
    [
      "forearms",
      "Alternating hammer curl",
      "straight_set",
      "single-10-20",
      [{ min: 10, max: 20 }],
    ],
    [
      "calves",
      "Standing barbell calf raise",
      "straight_set",
      "single-10-12",
      [{ min: 10, max: 12 }],
    ],
    [
      "hamstrings",
      "Lying leg curl",
      "rest_pause",
      "15-30",
      [{ min: 15, max: 30 }],
    ],
    [
      "quadriceps",
      "Leg extension",
      "straight_set",
      "single-10-15",
      [{ min: 10, max: 15 }],
    ],
    ["abs_1", "Reverse crunch", "straight_set", "none", []],
  ];
  const assignments = {};
  for (const slot of ["B1", "B3"])
    for (const [
      body_part,
      exercise,
      protocol,
      structure,
      target_sets,
    ] of definitions) {
      const assignment = {
        assignment_id: `${slot}:${body_part}`,
        slot,
        body_part,
        exercise,
        protocol,
        structure,
        target_sets,
        active: true,
        replaced_assignment_id: null,
        created_at: new Date().toISOString(),
      };
      assert.equal(isAssignment(assignment), true);
      assignments[`${slot}:${body_part}`] = assignment;
    }
  return {
    accountRevision: 0,
    activeWorkoutStartOperationId: null,
    assignments,
    history: {
      assignments: Object.values(assignments),
      steps: [],
      workouts: [],
    },
    logbookStates: {},
    recentOperation: null,
    recentlyCompletedWorkout: null,
    weightUnit: "lb",
    workout: {
      workout: null,
      steps: [],
      lastCompletedSlot: null,
      nextSlot: "B1",
      lifecycle: {
        phase: "blast",
        blast_id: "blast",
        blast_started_at: new Date().toISOString(),
        blast_ended_at: null,
        cruise_started_at: null,
        suggestion_due: false,
        suggestion_dismissed: false,
      },
    },
  };
}
function start(state, slot) {
  state.workout.nextSlot = slot;
  return reduceOfflineState(
    state,
    operation("start_workout", startWorkoutPayload(state)),
  );
}
function finish(state, amount = "100") {
  while (state.workout.workout) {
    const step = state.workout.steps.find((s) => s.status === "pending");
    const save = step.body_part === "hamstrings" && step.kind === "exercise";
    state = reduceOfflineState(
      state,
      operation("save_workout_step", {
        step_id: step.step_id,
        status: save ? "completed" : "skipped",
        weights: save ? [{ amount, unit: "lb" }] : [],
        reps: save ? [10, 3, 2] : [],
        duration_seconds: null,
      }),
    );
  }
  return state;
}
test("offline B1 and B3 share latest exercise performance in both directions", () => {
  let state = start(account(), "B1");
  assert.equal(state.workout.steps.length, 9);
  state = finish(state);
  state = start(state, "B3");
  let leg = state.workout.steps.find(
    (s) => s.body_part === "hamstrings" && s.kind === "exercise",
  );
  assert.equal(leg.previous_weight_entries[0].amount, "100");
  assert.deepEqual(leg.previous_reps, [10, 3, 2]);
  assert.equal(leg.fresh_baseline, false);
  state = finish(state, "110");
  state = start(state, "B1");
  leg = state.workout.steps.find(
    (s) => s.body_part === "hamstrings" && s.kind === "exercise",
  );
  assert.equal(leg.previous_weight_entries[0].amount, "110");
  assert.equal(
    state.history.steps.filter((s) => s.status === "completed").length,
    2,
  );
});
test("custom RP is exactly one valid combined range, and presets have consistent badges", () => {
  const draft = (targets) =>
    resolveAssignmentDraft(
      "quadriceps",
      "Leg extension",
      "rest_pause",
      "custom",
      targets,
    );
  assert.equal(draft([]).structureValid, false);
  assert.equal(draft([{ min: "11", max: "15" }]).structureValid, true);
  assert.equal(
    draft([
      { min: "11", max: "15" },
      { min: "3", max: "5" },
    ]).structureValid,
    false,
  );
  assert.equal(draft([{ min: "15", max: "11" }]).structureValid, false);
  assert.equal(positionsFor("B3").filter((p) => p.startsWith("abs")).length, 1);
  assert.equal(
    protocolChoices("hamstrings", "Barbell stiff-leg deadlift")[1].badge,
    "DC",
  );
  for (const protocol of ["rest_pause", "straight_set"])
    assert.ok(
      structureChoices("quadriceps", "Leg extension", protocol).filter(
        (s) => s.targets,
      ).length >= 2,
    );
});
test("workout shows targets, saves labelled loads, and keeps current draft when reviewing an earlier exercise", async () => {
  const state = start(account(), "B1");
  const steps = state.workout.steps;
  const first = steps[0];
  first.status = "completed";
  first.weight_entries = [
    { amount: "100", unit: "lb", micrograms: "45359237000" },
  ];
  first.reps = [10, 3, 2];
  steps[1].status = "completed";
  const current = steps[2];
  let saved;
  const props = {
    actionSaving: false,
    blockingStep: null,
    lastOperationId: null,
    lastOperationStatus: null,
    message: "",
    onBeginReplacement: () => {},
    onExit: () => {},
    onResolveAction: async () => true,
    onSave: async (...args) => {
      saved = args;
      return true;
    },
    onCorrect: async () => true,
    onSkip: async () => true,
    onUndo: async () => {},
    steps,
    weightUnit: "lb",
    workout: state.workout.workout,
  };
  document.body.innerHTML = '<div id="workout-test"></div>';
  const root = createRoot(document.getElementById("workout-test"));
  await act(async () => root.render(createElement(WorkoutTracer, props)));
  assert.match(document.body.textContent, /SET 1: 10–20 REPS/);
  const field = document.querySelector('[aria-label="REP 1"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(field, "12");
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const type = document.querySelector("select");
  await act(async () => {
    type.value = "body_weight";
    type.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "PREVIOUS EXERCISE")
      .click(),
  );
  assert.match(document.body.textContent, /11–15 TOTAL REPS/);
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "RETURN TO CURRENT")
      .click(),
  );
  assert.equal(document.querySelector('[aria-label="REP 1"]').value, "12");
  assert.equal(document.querySelector("select").value, "body_weight");
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "SAVE & NEXT")
      .click(),
  );
  assert.equal(saved[0].step_id, current.step_id);
  assert.deepEqual(saved[1], [
    { kind: "body_weight", amount: "0", unit: "lb" },
  ]);
  assert.deepEqual(saved[2], [12]);
  await act(async () => root.unmount());
});
