import test from "node:test";
import assert from "node:assert/strict";
import {
  source,
  account,
  start,
  save,
  finish,
  apply,
  mount,
  act,
  createElement,
  click,
  input,
} from "./behavior-runtime.mjs";
const domain = await source("workout-domain.ts");
const { stepTarget } = await source("offline-sync.ts");
const { weightMicrograms } = await source("weight-conversion.ts");
const { protocolInfo, structureChoices } = await source("rotation-config.ts");
const { useWorkout } = await source("hooks/use-workout.ts");
const { WorkoutTracer } = await source("WorkoutTracer.tsx");
function completed(state, slot, amount) {
  state.workout.nextSlot = slot;
  state = start(state);
  state = save(
    state,
    state.workout.steps[0],
    [{ amount, unit: "lb" }],
    [8, 3, 2],
  );
  return finish(state);
}
function correction(state, step, amount) {
  return {
    ...stepTarget(state, step),
    weights: [{ amount, unit: "lb" }],
    reps: step.reps,
    duration_seconds: null,
    expected_performance: {
      weights: step.weight_entries,
      reps: step.reps,
      duration_seconds: step.duration_seconds,
    },
  };
}
test("cross-slot correction updates dependent baselines and blocks changes during an active workout", () => {
  let state = completed(account(), "A1", "100");
  state = completed(state, "A2", "110");
  state = completed(state, "A3", "120");
  const original = state.history.steps.find((s) => s.status === "completed");
  const activeState = structuredClone(state);
  activeState.workout.nextSlot = "A1";
  const active = start(activeState);
  assert.throws(
    () =>
      apply(
        active,
        "correct_history_performance",
        correction(active, original, "130"),
      ),
    /FINISH ACTIVE WORKOUT/,
  );
  state = apply(
    state,
    "correct_history_performance",
    correction(state, original, "130"),
  );
  const performances = state.history.steps.filter(
    (s) => s.status === "completed",
  );
  assert.equal(performances[1].previous_weight_entries[0].amount, "130");
  assert.equal(performances[1].verdict, "failure");
  assert.equal(performances[2].previous_weight_entries[0].amount, "110");
  assert.equal(performances[2].verdict, "win");
});
test("labelled load validation and leg-extension prescriptions accept supported entries only", () => {
  for (const kind of ["body_weight", "bar", "band"]) {
    assert.equal(weightMicrograms({ kind, amount: "0", unit: "lb" }), 0n);
    assert.equal(weightMicrograms({ kind, amount: "20", unit: "lb" }), null);
  }
  assert.ok(protocolInfo("hamstrings", "Barbell stiff-leg deadlift"));
  for (const protocol of ["rest_pause", "straight_set"])
    assert.ok(
      structureChoices("quadriceps", "Leg extension", protocol).length >= 3,
    );
  let state = start(account());
  state = save(
    state,
    state.workout.steps[0],
    [{ kind: "band", amount: "0", unit: "lb" }],
    [8, 3, 2],
  );
  assert.equal(domain.validWorkoutStep(state.workout.steps[0]), true);
  assert.equal(
    domain.validWorkoutStep({
      ...state.workout.steps[0],
      weight_entries: [
        { kind: "band", amount: "3", unit: "lb", micrograms: "0" },
      ],
    }),
    false,
  );
});
test("saved exercise edits go through the hook and straight-set target ranges stay visible", async () => {
  let state = start(account());
  state = save(
    state,
    state.workout.steps[0],
    [{ amount: "100", unit: "lb" }],
    [8, 3, 2],
  );
  let hook;
  const commit = async (op) => {
    state = apply(state, op.kind, op.payload);
    return { data: state, error: "" };
  };
  function Host() {
    hook = useWorkout("owner", state, commit);
    return createElement("span");
  }
  const host = await mount(Host, {});
  await act(async () =>
    hook.correctStep(
      state.workout.steps[0],
      [{ amount: "110", unit: "lb" }],
      [8, 3, 2],
    ),
  );
  assert.equal(state.workout.steps[0].weight_entries[0].amount, "110");
  await host.close();
  const step = {
    ...state.workout.steps[0],
    step_id: "straight",
    status: "pending",
    protocol: "straight_set",
    structure: "custom",
    target_sets: [
      { min: 8, max: 12 },
      { min: 15, max: 15 },
    ],
    weight_entries: [],
    reps: [],
  };
  const view = await mount(WorkoutTracer, {
    steps: [step],
    workout: state.workout.workout,
    weightUnit: "lb",
    actionSaving: false,
    blockingStep: null,
    message: "",
    onExit: () => {},
    onSave: async () => true,
    onCorrect: async () => true,
    onSkip: async () => true,
    onUndo: async () => {},
    onResolveAction: async () => true,
    onBeginReplacement: () => {},
  });
  assert.match(
    view.container.querySelector(".prescription").textContent,
    /SET 1: 8–12 REPSSET 2: 15 REPS/,
  );
  await view.close();
});

test("pending logbook decisions block starts and timed holds preserve duration comparison", async () => {
  const state = account();
  state.logbookStates["A1:chest"] = "replacement_required";
  assert.throws(() => start(state), /RESOLVE|REPLACE|LOGBOOK/);
  const weights = [{ amount: "100", unit: "lb", micrograms: "45359237000" }];
  const previous = { weights, reps: [], durationSeconds: 30 };
  for (const [durationSeconds, verdict] of [
    [40, "win"],
    [20, "failure"],
  ]) {
    assert.equal(
      domain.compareLogbookPerformance({
        bodyPart: "abs_1",
        protocol: "timed_hold",
        targetSets: [],
        previous,
        current: { ...previous, durationSeconds },
      }).verdict,
      verdict,
    );
  }
  let active = start(account());
  const step = {
    ...active.workout.steps[0],
    status: "completed",
    fresh_baseline: false,
    previous_weight_entries: weights,
    previous_reps: [10, 3, 2],
    weight_entries: weights,
    reps: [8, 3, 2],
    verdict: "failure",
    enforcement_action: "mulligan_or_replace",
  };
  const view = await mount(WorkoutTracer, {
    steps: [step],
    workout: active.workout.workout,
    weightUnit: "lb",
    actionSaving: false,
    blockingStep: step,
    message: "",
    onExit: () => {},
    onSave: async () => true,
    onCorrect: async () => true,
    onSkip: async () => true,
    onUndo: async () => {},
    onResolveAction: async () => true,
    onBeginReplacement: () => {},
  });
  assert.match(view.container.textContent, /100 LB/);
  await view.close();
});
test("cruise home preserves the planned next slot and offers a new blast", async () => {
  const { default: FoundationHome } = await source("FoundationHome.tsx");
  const { offlineView } = await import("./behavior-runtime.mjs");
  const state = account("A2");
  state.workout.lifecycle.phase = "cruise";
  state.workout.lifecycle.cruise_started_at = "2026-10-01T00:00:00Z";
  globalThis.__testOffline = offlineView(state, async () => ({
    data: state,
    error: "",
  }));
  const view = await mount(FoundationHome, {
    userId: "owner",
    online: true,
    email: "owner@example.com",
    cloudStatus: "ready",
    onSignOut: async () => {},
  });
  assert.match(view.container.textContent, /CRUISE/);
  assert.ok(
    [...view.container.querySelectorAll("button")].some((b) =>
      b.textContent.includes("START NEW BLAST"),
    ),
  );
  await view.close();
});
