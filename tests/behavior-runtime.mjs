import { transpileForCoverage } from "./source-transform.mjs";
import { existsSync, readFileSync } from "node:fs";
import {
  createRequire,
  registerHooks,
  setSourceMapsSupport,
} from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
export const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const require = createRequire(path.join(target, "package.json"));
const { JSDOM } = require("jsdom");
export const dom = new JSDOM('<div id="root"></div>', {
  url: "https://test.invalid",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
setSourceMapsSupport(true);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/use-offline-sync.js"))
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const useOfflineSync = () => globalThis.__testOffline;",
      };
    if (context.parentURL?.startsWith("file:") && specifier.startsWith(".")) {
      const candidate = new URL(
        specifier.replace(/\.jsx$/, ".tsx").replace(/\.js$/, ".ts"),
        context.parentURL,
      );
      if (existsSync(fileURLToPath(candidate)))
        return { shortCircuit: true, url: candidate.href };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css"))
      return { format: "module", shortCircuit: true, source: "" };
    if (/\.tsx?$/.test(url))
      return {
        format: "module",
        shortCircuit: true,
        source: transpileForCoverage(
          readFileSync(fileURLToPath(url), "utf8"),
          fileURLToPath(url),
        ),
      };
    return nextLoad(url, context);
  },
});
export const source = (file) =>
  import(pathToFileURL(path.join(target, "src", file)).href);
export const { act, createElement } = await import(
  pathToFileURL(require.resolve("react")).href
);
const { createRoot } = await import(
  pathToFileURL(require.resolve("react-dom/client")).href
);
export async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next) =>
    act(async () => root.render(createElement(Component, next)));
  await render(props);
  return {
    container,
    render,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
export async function click(container, label) {
  const button = [...container.querySelectorAll("button")].find(
    (b) =>
      b.textContent.trim() === label || b.getAttribute("aria-label") === label,
  );
  if (!button)
    throw new Error(
      `Missing button ${label}; ${container.textContent.slice(-2000)}`,
    );
  await act(async () => button.click());
}
export async function input(container, selector, value) {
  const field = container.querySelector(selector);
  if (!field) throw new Error(`Missing input ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(field, String(value));
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const config = await source("rotation-config.ts");
const offline = await source("offline-sync.ts");
let sequence = 0;
export function apply(state, kind, payload) {
  return offline.reduceOfflineState(state, {
    id: `test-${++sequence}`,
    userId: "owner",
    sequence,
    baseRevision: 0,
    createdAt: Date.UTC(2026, 9, 1) + sequence * 1000,
    kind,
    payload,
  });
}
export function account(slot = "A1") {
  const assignments = {};
  for (const workoutSlot of config.WORKOUT_SLOTS) {
    for (const body_part of config.positionsFor(workoutSlot)) {
      const exercise = config.EXERCISES[config.categoryFor(body_part)][0];
      const protocol = config.protocolChoices(body_part, exercise)[0].value;
      const choice = config
        .structureChoices(body_part, exercise, protocol)
        .find((c) => c.targets) ?? { value: "none", targets: [] };
      assignments[`${workoutSlot}:${body_part}`] = {
        assignment_id: `${workoutSlot}:${body_part}`,
        slot: workoutSlot,
        body_part,
        exercise,
        protocol,
        structure: choice.value,
        target_sets: choice.targets,
        active: true,
        replaced_assignment_id: null,
        created_at: "2026-09-01T00:00:00Z",
      };
    }
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
      nextSlot: slot,
      lifecycle: {
        phase: "blast",
        blast_id: "blast",
        blast_started_at: "2026-09-01T00:00:00Z",
        blast_ended_at: null,
        cruise_started_at: null,
        suggestion_due: false,
        suggestion_dismissed: false,
      },
    },
  };
}
export function start(state) {
  return apply(state, "start_workout", offline.startWorkoutPayload(state));
}
export function save(state, step, weights, reps, status = "completed") {
  return apply(state, "save_workout_step", {
    ...offline.stepTarget(state, step),
    status,
    weights,
    reps,
    duration_seconds: null,
  });
}
export function finish(state) {
  while (state.workout.workout)
    state = save(
      state,
      state.workout.steps.find((s) => s.status === "pending"),
      [],
      [],
      "skipped",
    );
  return state;
}
export function offlineView(state, commitOperation) {
  return {
    accountState: state,
    commitOperation,
    conflict: null,
    conflictDeferred: false,
    deviceAccess: "active",
    loaded: true,
    loadError: "",
    syncState: "synced",
    retry: async () => true,
  };
}
