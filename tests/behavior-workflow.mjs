import assert from "node:assert/strict";
import {
  source,
  mount,
  click,
  input,
  act,
  createElement,
  account,
  start,
  save,
  finish,
  apply,
  offlineView,
} from "./behavior-runtime.mjs";
const { default: FoundationHome } = await source("FoundationHome.tsx");
const { default: HistoryScreen } = await source("HistoryScreen.tsx");
const { default: RotationSetup } = await source("RotationSetup.tsx");
const { useRotationEditor } = await source("hooks/use-rotation-editor.ts");
const { useRotationAssignments } = await source(
  "hooks/use-rotation-assignment.ts",
);
const { isAssignment } = await source("rotation-assignment.ts");
const { resolveAssignmentDraft } = await source("rotation-assignment-draft.ts");
const { displayWeight } = await source("weight-conversion.ts");
const { compareLogbookPerformance } = await source("workout-domain.ts");
export async function workflowCase(slot, amount, reps) {
  let state = account(slot);
  const committed = [];
  const commit = async (op) => {
    committed.push(op);
    state = apply(state, op.kind, op.payload);
    globalThis.__testOffline = offlineView(state, commit);
    return { data: state, error: "" };
  };
  globalThis.__testOffline = offlineView(state, commit);
  const home = await mount(FoundationHome, {
    userId: "owner",
    email: "owner@example.com",
    online: true,
    cloudStatus: "ready",
    onSignOut: async () => {},
  });
  const startButton = [...home.container.querySelectorAll("button")].find((b) =>
    b.textContent.includes(`START ${slot}`),
  );
  assert.ok(startButton && !startButton.disabled);
  await act(async () => startButton.click());
  assert.equal(state.workout.workout.slot, slot);
  await input(home.container, "#weight-0", amount);
  for (const [i, rep] of reps.entries())
    await input(home.container, `#rep-${i}`, rep);
  await click(home.container, "SAVE & NEXT");
  const performed = state.history.steps.find((s) => s.status === "completed");
  assert.deepEqual(performed.reps, reps);
  await home.close();
  state = finish(state);
  const history = await mount(HistoryScreen, {
    accountState: state,
    commitOperation: commit,
    onHome: () => {},
    weightUnit: "lb",
  });
  await input(history.container, "#history-search", "Incline barbell press");
  const result = [
    ...history.container.querySelectorAll(".history-search-results button"),
  ].find((b) =>
    b.querySelector("span").textContent.split(" · ").includes(slot),
  );
  assert.ok(result);
  await act(async () => result.click());
  assert.ok(history.container.textContent.includes("Incline barbell press"));
  const correction = history.container.querySelector(
    ".performance-rows button",
  );
  assert.ok(correction, history.container.textContent.slice(-1800));
  await act(async () => correction.click());
  const observedReps = [
    ...history.container.querySelectorAll('[id^="correction-reps-"]'),
  ].map((f) => Number(f.value));
  const observedAmount = history.container.querySelector(
    "#correction-weight-0",
  ).value;
  assert.deepEqual(observedReps, reps);
  await input(history.container, "#correction-reps-0", reps[0] + 1);
  await click(history.container, "SAVE CORRECTION");
  assert.equal(
    state.history.steps.find((s) => s.step_id === performed.step_id).reps[0],
    reps[0] + 1,
  );
  await act(async () =>
    history.container.querySelector(".history-back").click(),
  );
  await click(history.container, "WORKOUTS");
  await act(async () =>
    history.container.querySelector(".workout-row").click(),
  );
  assert.ok(
    history.container
      .querySelector(".saved-entry-list")
      .textContent.includes(selectedExercise(state, slot)),
  );
  await history.close();
  const rotation = await mount(RotationSetup, {
    accountState: state,
    commitOperation: commit,
    onBack: () => {},
  });
  const toggle = [
    ...rotation.container.querySelectorAll(".workout-toggle"),
  ].find((b) => b.textContent.includes(slot));
  await act(async () => toggle.click());
  const card = [
    ...rotation.container.querySelectorAll(".assignment-card"),
  ].find((b) => !b.closest("[hidden]") && b.textContent.includes("CHEST"));
  assert.ok(card);
  await act(async () => card.click());
  const selected = rotation.container.querySelector(
    'input[name="exercise"]:checked',
  )?.value;
  assert.equal(selected, "Incline barbell press");
  await click(rotation.container, "CONTINUE");
  await click(rotation.container, "CONTINUE");
  await act(async () =>
    rotation.container
      .querySelector('input[name="structure"][value="custom"]')
      .click(),
  );
  await input(rotation.container, "#custom-min-0", reps[0]);
  await input(rotation.container, "#custom-max-0", reps[0] + 4);
  await click(rotation.container, "CONTINUE");
  assert.ok(
    rotation.container.textContent.includes(`${reps[0]}\u2013${reps[0] + 4}`),
  );
  await rotation.close();
  let editor, assignments;
  function Hooks() {
    editor = useRotationEditor(state.assignments);
    assignments = useRotationAssignments(state, commit);
    return createElement("span", null, editor.exercise);
  }
  const hooks = await mount(Hooks, {});
  await act(async () => editor.editAssignment(slot, "chest"));
  assert.equal(editor.exercise, selected);
  const targets = [{ min: reps[0], max: reps[0] + 4 }];
  const resolved = resolveAssignmentDraft(
    "chest",
    selected,
    "rest_pause",
    "custom",
    targets.map((t) => ({ min: String(t.min), max: String(t.max) })),
  );
  assert.equal(resolved.structureValid, true);
  await act(async () =>
    assignments.saveAssignment(
      slot,
      "chest",
      state.assignments[`${slot}:chest`].assignment_id,
      selected,
      "rest_pause",
      "custom",
      resolved.targets,
    ),
  );
  assert.equal(isAssignment(state.assignments[`${slot}:chest`]), true);
  const previous = {
    weights: performed.weight_entries,
    reps,
    durationSeconds: null,
  };
  const comparison = compareLogbookPerformance({
    bodyPart: "chest",
    protocol: "rest_pause",
    targetSets: targets,
    previous,
    current: { ...previous, reps: [reps[0] + 1, ...reps.slice(1)] },
  });
  await hooks.close();
  return {
    slot: state.history.workouts[0].slot,
    amount: displayWeight(performed.weight_entries[0], "lb").amount,
    recordedAmount: observedAmount,
    recordedReps: observedReps,
    correctedReps: state.history.steps.find(
      (s) => s.step_id === performed.step_id,
    ).reps,
    exercise: selected,
    target: state.assignments[`${slot}:chest`].target_sets,
    comparison: comparison.verdict,
  };
}

function selectedExercise(state, slot) {
  return state.assignments[`${slot}:chest`].exercise;
}
