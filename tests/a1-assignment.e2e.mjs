import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(pathToFileURL(path.join(target, "package.json")));
const definition =
  process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ??
  fileURLToPath(new URL("..", import.meta.url));
const definitionRequire = createRequire(
  pathToFileURL(path.join(definition, "package.json")),
);

const install = (cwd) => {
  const options = { cwd, stdio: "ignore", timeout: 90_000 };
  if (process.platform === "win32") {
    execFileSync(
      process.env.ComSpec,
      ["/d", "/s", "/c", "npm ci --ignore-scripts --no-audit --no-fund"],
      options,
    );
  } else {
    execFileSync(
      npm,
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      options,
    );
  }
};

try {
  require.resolve("typescript");
} catch {
  install(target);
}

try {
  definitionRequire.resolve("jsdom");
} catch {
  install(definition);
}

const ts = require("typescript");
const {
  createClient: createVerificationClient,
} = require("@supabase/supabase-js");
const { JSDOM } = definitionRequire("jsdom");
const calls = [];
const offlineAuthJwks = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "foundation-test-key",
      kty: "EC",
      use: "sig",
      x: "7B1IiuxQLUBKu_UmjGEJrOEfvD4-NHLg9wpU5c4gW0E",
      y: "NTs3pjIiVGEAhx_076fE5DKTIgkJWuB-z5ndfhdmR8g",
    },
  ],
};
const offlineOwnerSubjectSha256 =
  "391887cbcf922e19d672df700739c4a3c74e35ee3d57e7ad97506cd331cd953c";
const offlineAccessToken =
  "eyJhbGciOiJFUzI1NiIsImtpZCI6ImZvdW5kYXRpb24tdGVzdC1rZXkiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3MDAwMDAwMDAsImlzcyI6Imh0dHBzOi8vZXhhbXBsZS5zdXBhYmFzZS5jby9hdXRoL3YxIiwiaXNfYW5vbnltb3VzIjpmYWxzZSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzZXNzaW9uX2lkIjoiZm91bmRhdGlvbi10ZXN0LXNlc3Npb24iLCJzdWIiOiJvd25lci0xIn0.j0an6z1YaPcK1U9h4dJE34hIjL2fR-c7b5Y-H8ncAQKDrsXnuFHW5CKKQ51aC09BZ07TmVYJJQgKoTi7lTsTxw";
const session = {
  access_token: offlineAccessToken,
  user: { email: "owner@example.com", id: "owner-1" },
};
const verificationClient = createVerificationClient(
  "https://example.supabase.co",
  "publishable-test-key",
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);
const sessionResolvers = [];
let authCallback;
let profileResult = { data: { status: "ready" }, error: null };
let assignmentResult = { data: [], error: null };
let updateResult = { error: null };
let rotationState = { last_completed_slot: null, next_slot: "A1" };
let workoutResult = { data: null, error: null };
let workoutSteps = [];
let rotationAdvancements = 0;
let loseNextWorkoutSaveResponse = true;
const workoutOperations = new Map();
const rotationOrder = {
  A1: "B1",
  B1: "A2",
  A2: "B2",
  B2: "A3",
  A3: "B3",
  B3: "A1",
};

const exerciseStep = ({
  body_part,
  exercise,
  ordinal,
  protocol = "rest_pause",
  structure = "11-15",
  target_sets = [{ max: 15, min: 11 }],
  workout_id,
}) => ({
  assignment_id: `assignment-${workout_id}-${body_part}`,
  body_part,
  duration_seconds: null,
  exercise,
  kind: "exercise",
  ordinal,
  previous_duration_seconds: null,
  previous_reps: [],
  previous_weight_entries: [],
  protocol,
  reps: [],
  status: "pending",
  step_id: `${workout_id}-step-${ordinal}`,
  structure,
  target_sets,
  weight_entries: [],
  workout_id,
});

const stretchStep = (workout_id, body_part, ordinal) => ({
  assignment_id: null,
  body_part,
  duration_seconds: null,
  exercise: null,
  kind: "stretch",
  ordinal,
  previous_duration_seconds: null,
  previous_reps: [],
  previous_weight_entries: [],
  protocol: null,
  reps: [],
  status: "pending",
  step_id: `${workout_id}-step-${ordinal}`,
  structure: null,
  target_sets: [],
  weight_entries: [],
  workout_id,
});

const workoutTemplate = (slot, workout_id) => {
  if (slot.startsWith("A")) {
    return [
      exerciseStep({ body_part: "chest", exercise: "Incline barbell press", ordinal: 1, workout_id }),
      stretchStep(workout_id, "chest", 2),
      exerciseStep({ body_part: "shoulders", exercise: "Standing barbell military press", ordinal: 3, workout_id }),
      stretchStep(workout_id, "shoulders", 4),
      exerciseStep({ body_part: "triceps", exercise: "Close-grip barbell bench press", ordinal: 5, workout_id }),
      stretchStep(workout_id, "triceps", 6),
      exerciseStep({ body_part: "back_width", exercise: "Pull-ups", ordinal: 7, workout_id }),
      exerciseStep({
        body_part: "back_thickness",
        exercise: "Conventional deadlift",
        ordinal: 8,
        protocol: "straight_set",
        structure: "deadlift-6-8-10-12",
        target_sets: [{ max: 8, min: 6 }, { max: 12, min: 10 }],
        workout_id,
      }),
      stretchStep(workout_id, "back", 9),
    ];
  }
  return [
    exerciseStep({ body_part: "biceps", exercise: "Straight-bar curl", ordinal: 1, workout_id }),
    stretchStep(workout_id, "biceps", 2),
    exerciseStep({
      body_part: "forearms",
      exercise: "Alternating hammer curl",
      ordinal: 3,
      protocol: "straight_set",
      structure: "custom",
      target_sets: [{ max: 12, min: 10 }, { max: 20, min: 20 }],
      workout_id,
    }),
    exerciseStep({
      body_part: "calves",
      exercise: "Standing barbell calf raise",
      ordinal: 4,
      protocol: "straight_set",
      structure: "single-10-12",
      target_sets: [{ max: 12, min: 10 }],
      workout_id,
    }),
    exerciseStep({
      body_part: "hamstrings",
      exercise: "Barbell stiff-leg deadlift",
      ordinal: 5,
      protocol: "straight_set",
      structure: "single-10-15",
      target_sets: [{ max: 15, min: 10 }],
      workout_id,
    }),
    stretchStep(workout_id, "hamstrings", 6),
    exerciseStep({
      body_part: "quadriceps",
      exercise: "Barbell back squat",
      ordinal: 7,
      protocol: "straight_set",
      structure: "widowmaker-4-6-20",
      target_sets: [{ max: 6, min: 4 }, { max: 20, min: 20 }],
      workout_id,
    }),
    stretchStep(workout_id, "quadriceps", 8),
    exerciseStep({
      body_part: "abs_1",
      exercise: "High-pulley cable crunch",
      ordinal: 9,
      protocol: "straight_set",
      structure: "none",
      target_sets: [],
      workout_id,
    }),
    exerciseStep({
      body_part: "abs_2",
      exercise: "Front Plank",
      ordinal: 10,
      protocol: "timed_hold",
      structure: "none",
      target_sets: [],
      workout_id,
    }),
  ];
};

const client = {
  auth: {
    getClaims: async (token, options) => {
      calls.push(["getClaims", token, options]);
      return verificationClient.auth.getClaims(token, options);
    },
    getSession: () => {
      calls.push(["getSession"]);
      return new Promise((resolve) => sessionResolvers.push(resolve));
    },
    onAuthStateChange: (callback) => {
      calls.push(["onAuthStateChange"]);
      authCallback = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    resetPasswordForEmail: async (email, options) => {
      calls.push(["resetPasswordForEmail", email, options]);
      return { error: null };
    },
    signInWithPassword: async (credentials) => {
      calls.push(["signInWithPassword", credentials]);
      return { error: { message: "User not found" } };
    },
    signOut: async (options) => {
      calls.push(["signOut", options]);
      if (options?.scope === "local") {
        queueMicrotask(() => authCallback("SIGNED_OUT", null));
      }
      return { error: null };
    },
    updateUser: async (attributes) => {
      calls.push(["updateUser", attributes]);
      return updateResult;
    },
  },
  from(table) {
    calls.push(["from", table]);
    const filters = {};
    const query = {
      select(columns) {
        calls.push(["select", columns]);
        return query;
      },
      eq(column, value) {
        calls.push(["eq", column, value]);
        filters[column] = value;
        return query;
      },
      async maybeSingle() {
        calls.push(["maybeSingle", table]);
        if (table === "foundation_profiles") return profileResult;
        if (table === "workout_rotation_state") {
          return { data: rotationState, error: null };
        }
        if (table === "workouts") return workoutResult;
        return assignmentResult;
      },
      order() {
        calls.push(["order", table]);
        return Promise.resolve({
          data:
            table === "workout_steps"
              ? workoutSteps.filter(
                  (step) =>
                    !filters.workout_id ||
                    step.workout_id === filters.workout_id,
                )
              : assignmentResult.data,
          error: null,
        });
      },
      then(resolve, reject) {
        const result =
          table === "workout_steps"
            ? { data: workoutSteps, error: null }
            : assignmentResult;
        return Promise.resolve(result).then(resolve, reject);
      },
      async upsert(values, options) {
        calls.push(["upsert", table, values, options]);
        assignmentResult = { data: values, error: null };
        return { error: null };
      },
    };
    return query;
  },
  async rpc(name, values) {
    calls.push(["rpc", name, values]);
    if (name === "start_a1_workout") {
      if (workoutResult.data) return workoutResult;
      const slot = rotationState.next_slot;
      const workout = {
        completed_at: null,
        slot,
        status: "in_progress",
        workout_id: `workout-${slot}`,
      };
      workoutSteps = workoutTemplate(slot, workout.workout_id);
      if (slot.startsWith("B")) {
        const previous = workoutSteps.find(
          (step) => step.body_part === "forearms",
        );
        previous.previous_weight_entries = [
          { amount: "80", micrograms: "36287389600", unit: "lb" },
          { amount: "60", micrograms: "27215542200", unit: "lb" },
        ];
        previous.previous_reps = [11, 20];
      }
      workoutResult = { data: workout, error: null };
      return workoutResult;
    }
    if (name === "save_a1_workout_step") {
      if (workoutOperations.has(values.p_operation_id)) {
        const step = workoutSteps.find(
          (item) =>
            item.step_id ===
            workoutOperations.get(values.p_operation_id).stepId,
        );
        return {
          data: {
            next_slot: rotationState.next_slot,
            step,
            workout: workoutResult.data,
          },
          error: null,
        };
      }
      const stepIndex = workoutSteps.findIndex(
        (item) => item.step_id === values.p_step_id,
      );
      const step = structuredClone(workoutSteps[stepIndex]);
      workoutOperations.set(values.p_operation_id, {
        before: structuredClone(step),
        stepId: step.step_id,
      });
      step.status = values.p_status;
      step.reps = values.p_reps;
      step.duration_seconds = values.p_duration_seconds;
      step.weight_entries = values.p_weights.map((weight) => ({
        ...weight,
        micrograms: String(
          BigInt(
            Math.round(Number(weight.amount) * (weight.unit === "lb" ? 2 : 4)),
          ) * BigInt(weight.unit === "lb" ? 226796185 : 250000000),
        ),
      }));
      workoutSteps[stepIndex] = step;
      const completedNow = workoutSteps.every(
        (item) => item.status !== "pending",
      );
      if (completedNow) {
        const completedSlot = workoutResult.data.slot;
        workoutResult.data = {
          ...workoutResult.data,
          completed_at: "2026-08-09T13:00:00Z",
          status: "completed",
        };
        rotationState = {
          last_completed_slot: completedSlot,
          next_slot: rotationOrder[completedSlot],
        };
        rotationAdvancements += 1;
      }
      return workoutSaveResponse({
        completed_now: completedNow,
        next_slot: rotationState.next_slot,
        step,
        workout: workoutResult.data,
      });
    }
    if (name === "undo_a1_workout_step") {
      const operation = workoutOperations.get(values.p_operation_id);
      const index = workoutSteps.findIndex(
        (item) => item.step_id === operation.stepId,
      );
      workoutSteps[index] = operation.before;
      return { data: workoutSteps[index], error: null };
    }
    const previous = assignmentResult.data.find(
      (row) =>
        row.active &&
        row.slot === values.p_slot &&
        row.body_part === values.p_body_part,
    );
    const row = {
      active: true,
      assignment_id: `assignment-${calls.length}`,
      body_part: values.p_body_part,
      exercise: values.p_exercise,
      protocol: values.p_protocol,
      replaced_assignment_id: previous?.assignment_id ?? null,
      slot: values.p_slot,
      structure: values.p_structure,
      target_sets: values.p_target_sets,
    };
    assignmentResult = {
      data: [
        ...assignmentResult.data.map((item) =>
          item === previous ? { ...item, active: false } : item,
        ),
        row,
      ],
      error: null,
    };
    return { data: row, error: null };
  },
};

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://dc-training.test/?error_code=otp_expired",
});
Object.assign(globalThis, {
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  MouseEvent: dom.window.MouseEvent,
  Node: dom.window.Node,
  window: dom.window,
  __foundationCalls: calls,
  __foundationClient: client,
  __foundationEnv: {
    VITE_SUPABASE_AUTH_JWKS: JSON.stringify(offlineAuthJwks),
    VITE_SUPABASE_OWNER_SUB_SHA256: offlineOwnerSubjectSha256,
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    VITE_SUPABASE_URL: "https://example.supabase.co",
  },
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const moduleUrl = (source) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const supabaseUrl = moduleUrl(`
export const createClient = (url, key, options) => {
  globalThis.__foundationCalls.push(["createClient", url, key, options.auth]);
  return globalThis.__foundationClient;
};
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@supabase/supabase-js") {
      return { shortCircuit: true, url: supabaseUrl };
    }

    if (context.parentURL?.startsWith("file:") && specifier.startsWith(".")) {
      const requested = new URL(specifier, context.parentURL);
      const candidates = [requested];
      if (specifier.endsWith(".js")) {
        candidates.push(
          new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL),
        );
      } else if (specifier.endsWith(".jsx")) {
        candidates.push(
          new URL(specifier.replace(/\.jsx$/, ".tsx"), context.parentURL),
        );
      } else if (!path.extname(specifier)) {
        candidates.push(new URL(`${specifier}.ts`, context.parentURL));
        candidates.push(new URL(`${specifier}.tsx`, context.parentURL));
      }
      const match = candidates.find((candidate) =>
        existsSync(fileURLToPath(candidate)),
      );
      if (match) return { shortCircuit: true, url: match.href };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "" };
    }
    if (url.endsWith(".png")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(url)};`,
      };
    }
    if (url.endsWith(".ts") || url.endsWith(".tsx")) {
      const fileName = fileURLToPath(url);
      const source = readFileSync(fileName, "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: ts
          .transpileModule(source, {
            compilerOptions: {
              inlineSourceMap: true,
              inlineSources: true,
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
            fileName,
          })
          .outputText.replaceAll(
            "import.meta.env",
            "globalThis.__foundationEnv",
          ),
      };
    }
    return nextLoad(url, context);
  },
});

const reactUrl = pathToFileURL(require.resolve("react")).href;
const { act } = await import(reactUrl);
const root = document.getElementById("root");
const text = () => root.textContent ?? "";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const settleLoading = async () => {
  for (let attempt = 0; attempt < 20 && text().includes("LOADING"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
const hasCall = (name, predicate = () => true) =>
  calls.some((call) => call[0] === name && predicate(call));
const countCalls = (name) => calls.filter((call) => call[0] === name).length;

const setInput = async (id, value) => {
  const input = document.getElementById(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await flush();
  });
};
const assignmentCard = (workout, position) => {
  const section = [...document.querySelectorAll(".workout-group")].find(
    (candidate) =>
      candidate.querySelector(".rotation-label")?.textContent ===
      `${workout} WORKOUT`,
  );
  return [...(section?.querySelectorAll("button.assignment-card") ?? [])].find(
    (button) => button.querySelector("span")?.textContent === position,
  );
};

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  await import(pathToFileURL(path.join(target, "src/main.tsx")).href);
});
const loading = text().includes("LOADING");

await act(async () => {
  for (const resolve of sessionResolvers.splice(0)) {
    resolve({ data: { session } });
  }
  await flush();
});
await act(settleLoading);
const coldOffline = text();
const coldSignOutDisabled = document.querySelector(
  "button.secondary-action",
)?.disabled;
const coldStartNoCloudRead = countCalls("from") === 0;

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const firstOnline = text();
const firstOnlineCloudReads = countCalls("from");

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
});
await act(settleLoading);
const offline = text();
const signOutDisabled = document.querySelector(
  "button.secondary-action",
)?.disabled;

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const reconnected = text();
const reconnectRefetched = countCalls("from") > firstOnlineCloudReads;

profileResult = { data: null, error: { message: "temporarily unavailable" } };
const localSignOutsBeforeProfileError = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "local",
).length;
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
});
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const profileErrorSignedOut =
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "local")
    .length ===
    localSignOutsBeforeProfileError + 1 &&
  text().includes("OWNER ACCESS") &&
  !text().includes("APP FOUNDATION");
const profileErrorHandled =
  profileErrorSignedOut || text().includes("SYNC FAILED · SAVED ON DEVICE");
profileResult = { data: { status: "ready" }, error: null };
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});

await act(async () => {
  document.querySelector("button.secondary-action").click();
  await flush();
});
const signOutSubmitted = hasCall("signOut", (call) => call[1] === undefined);
await act(async () => {
  authCallback("SIGNED_OUT", null);
});
const readsBeforeSignedOut = countCalls("from");
const expiredRecoveryExplained = text().includes(
  "Reset link expired or was already used. Request a new one.",
);

await setInput("email", "owner@example.com");
await setInput("password", "correct-horse-battery-staple");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SIGN IN"))
    .click();
  await flush();
});
const genericSignInError = text().includes(
  "Sign-in failed. Check your email and password.",
);

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("FORGOT PASSWORD?"))
    .click();
  await flush();
});
const resetMessage = text().includes(
  "If this account exists, a reset link is on its way.",
);
const signedOutReadBlocked = countCalls("from") === readsBeforeSignedOut;

const localSignOutsBeforeMissingProfile = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "local",
).length;
profileResult = { data: null, error: null };
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
const missingProfileSignedOut =
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "local")
    .length ===
    localSignOutsBeforeMissingProfile + 1 && text().includes("OWNER ACCESS");
profileResult = { data: { status: "ready" }, error: null };

await act(async () => {
  authCallback("PASSWORD_RECOVERY", session);
});
const recoveryShown = text().includes("OWNER RECOVERY");
await setInput("new-password", "short");
await setInput("confirm-password", "short");
const updatesBeforeShortPassword = countCalls("updateUser");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryShortPasswordRejected =
  text().includes("Use at least 12 characters.") &&
  countCalls("updateUser") === updatesBeforeShortPassword;

await setInput("new-password", "correct-horse-battery-staple");
await setInput("confirm-password", "mismatched-recovery-password");
const updatesBeforeMismatch = countCalls("updateUser");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryMismatchRejected =
  text().includes("Passwords do not match.") &&
  countCalls("updateUser") === updatesBeforeMismatch;

await setInput("confirm-password", "correct-horse-battery-staple");
updateResult = { error: { message: "recovery session expired" } };
const updatesBeforeFailure = countCalls("updateUser");
const otherSignOutsBeforeFailure = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "others",
).length;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryFailureRetained =
  text().includes("Password could not be updated. Request a new reset link.") &&
  text().includes("OWNER RECOVERY") &&
  countCalls("updateUser") === updatesBeforeFailure + 1 &&
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "others")
    .length === otherSignOutsBeforeFailure;

updateResult = { error: null };
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryExited =
  text().includes("NEXT WORKOUT") && !text().includes("OWNER RECOVERY");
const mountedApplication =
  root.childElementCount > 0 && text().includes("DC TRAINING");

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("ROTATION SETUP"))
    .click();
  await flush();
});
await act(settleLoading);
const emptyA1 =
  text().includes("A1 WORKOUT") && text().includes("CHOOSE EXERCISE");

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CHOOSE EXERCISE"))
    .click();
});
const exerciseRadios = [...document.querySelectorAll('input[name="exercise"]')];
const approvedChestPool = exerciseRadios.length === 9 && !text().includes("†");
const exerciseContinueDisabled = [...document.querySelectorAll("button")].find(
  (button) => button.textContent.includes("CONTINUE"),
).disabled;
await act(async () => exerciseRadios[0].click());
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});

const protocolInitiallyEmpty =
  document.querySelectorAll('input[name="protocol"]:checked').length === 0 &&
  [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("CONTINUE"),
  ).disabled;
await act(async () =>
  document
    .querySelector('button[aria-label="CHEST protocol information"]')
    .click(),
);
const protocolGuidance = text().includes(
  "Classic DC uses one rest-pause work set.",
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("GOT IT"))
    .click(),
);
await act(async () =>
  document.querySelector('input[value="rest_pause"]').click(),
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});

const rangeInitiallyEmpty =
  document.querySelectorAll('input[name="structure"]:checked').length === 0 &&
  [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("CONTINUE"),
  ).disabled;
await act(async () => document.querySelector('input[value="11-15"]').click());
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});
const reviewComplete =
  text().includes("REVIEW ASSIGNMENT") &&
  text().includes("Incline barbell press") &&
  text().includes("REST-PAUSE") &&
  text().includes("11–15");

await act(async () => document.querySelector("button.back-action").click());
const backPreserved = document.querySelector('input[value="11-15"]').checked;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});
const savesBeforeSave = calls.filter((call) => call[0] === "rpc").length;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SAVE")
    .click();
  await flush();
});
const savedExactlyOnce =
  calls.filter((call) => call[0] === "rpc").length === savesBeforeSave + 1 &&
  text().includes("Incline barbell press");

await act(async () => authCallback("SIGNED_OUT", null));
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
await act(settleLoading);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("ROTATION SETUP"))
    .click();
  await flush();
});
await act(settleLoading);
const restoredAfterRemount =
  text().includes("A1 WORKOUT") &&
  text().includes("Incline barbell press") &&
  text().includes("11–15");

await act(async () => assignmentCard("B1", "FOREARMS").click());
const bPoolMatched =
  document.querySelectorAll('input[name="exercise"]').length === 11;
await act(async () => document.querySelector('input[name="exercise"]').click());
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () =>
  document.querySelector('input[value="straight_set"]').click(),
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () => document.querySelector('input[value="custom"]').click());
await setInput("custom-set-count", "2");
await setInput("custom-min-0", "10");
await setInput("custom-max-0", "12");
await setInput("custom-min-1", "20");
await setInput("custom-max-1", "20");
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
const bCustomReviewed =
  text().includes("B1 · FOREARMS") && text().includes("10–12 + 20");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SAVE")
    .click();
  await flush();
});

await act(async () => assignmentCard("B1", "ABS 1").click());
const fullAbsPool =
  document.querySelectorAll('input[name="exercise"]').length === 11;
await act(async () => document.querySelector('input[name="exercise"]').click());
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
const absProtocols =
  document.querySelectorAll('input[name="protocol"]').length === 2 &&
  !text().includes("REST-PAUSE");
await act(async () =>
  document.querySelector('input[value="timed_hold"]').click(),
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SAVE")
    .click();
  await flush();
});

await act(async () => authCallback("SIGNED_OUT", null));
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
await act(settleLoading);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("ROTATION SETUP"))
    .click();
  await flush();
});
await act(settleLoading);
const completeReload =
  text().includes("Incline barbell press") &&
  text().includes("Alternating hammer curl") &&
  text().includes("10–12 + 20") &&
  text().includes("High-pulley cable crunch") &&
  text().includes("TIMED HOLD");
const s02CloudBoundaries =
  hasCall(
    "rpc",
    (call) =>
      call[2]?.p_slot === "B1" &&
      call[2]?.p_body_part === "forearms" &&
      call[2]?.p_structure === "custom" &&
      call[2]?.p_target_sets?.length === 2,
  ) &&
  hasCall(
    "rpc",
    (call) =>
      call[2]?.p_slot === "B1" &&
      call[2]?.p_body_part === "abs_1" &&
      call[2]?.p_protocol === "timed_hold" &&
      call[2]?.p_structure === "none",
  );

await act(async () => assignmentCard("B1", "CALVES").click());
await act(async () => document.querySelector('input[name="exercise"]').click());
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () =>
  document.querySelector('input[value="straight_set"]').click(),
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () =>
  document.querySelector('input[value="single-10-12"]').click(),
);
await act(async () =>
  document
    .querySelector('button[aria-label="CALVES structure information"]')
    .click(),
);
const calfSheet = document.querySelector('[role="dialog"]');
const calfInformationSheet =
  calfSheet?.textContent.includes("Lower slowly over 5 seconds.") &&
  calfSheet.textContent.includes("Hold the bottom position for 15 seconds.") &&
  calfSheet.textContent.includes("Explode upward onto your toes.") &&
  !calfSheet.textContent.toLowerCase().includes("countdown");
await act(async () =>
  document.querySelector('button[aria-label="CLOSE INFORMATION"]').click(),
);
assert.equal(document.querySelector('[role="dialog"]'), null);
await act(async () =>
  document
    .querySelector('button[aria-label="CALVES structure information"]')
    .click(),
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("GOT IT"))
    .click(),
);
assert.equal(document.querySelector('[role="dialog"]'), null);
for (let index = 0; index < 3; index += 1)
  await act(async () => document.querySelector("button.back-action").click());

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Incline barbell press"))
    .click();
});
await act(async () =>
  document.querySelectorAll('input[name="exercise"]')[1].click(),
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});
const replacementClearsDownstream =
  document.querySelectorAll('input[name="protocol"]:checked').length === 0 &&
  [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("CONTINUE"),
  ).disabled;

for (let index = 0; index < 3; index += 1)
  await act(async () => document.querySelector("button.back-action").click());

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("START A1"))
    .click();
  await flush();
});

const saveExercise = async (weight = "100") => {
  await setInput("weight-0", weight);
  await setInput("rep-0", "8");
  await setInput("rep-1", "4");
  await setInput("rep-2", "2");
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("SAVE & NEXT"))
      .click();
    await flush();
  });
};
const saveStraightSets = async (weights, reps) => {
  for (let index = 0; index < weights.length; index += 1) {
    await setInput(`weight-${index}`, weights[index]);
    await setInput(`rep-${index}`, String(reps[index]));
  }
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("SAVE & NEXT"))
      .click();
    await flush();
  });
};
const completeStretch = async () => {
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("STRETCH COMPLETE"))
      .click();
    await flush();
  });
};
const captureStretch = async (asset, lines) => {
  await act(async () =>
    document.querySelector('button[aria-label="STRETCH INFORMATION"]').click(),
  );
  const dialog = document.querySelector('[role="dialog"]');
  const copy = dialog?.textContent ?? "";
  const captured =
    lines.every((line) => copy.includes(line)) &&
    document.querySelector(".stretch-card img")?.src.includes(asset) &&
    !copy.toLowerCase().includes("countdown") &&
    !copy.toLowerCase().includes("timer");
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("GOT IT"))
      .click(),
  );
  return captured;
};

const startedA1 =
  text().toUpperCase().includes("INCLINE BARBELL PRESS") &&
  text().includes("1 OF 5");
await saveExercise("100.5");
const responseLossRetried =
  text().includes("NETWORK RESPONSE LOST") && workoutOperations.size === 1;
await saveExercise("100.5");
const undoOffered = text().includes("SAVED") && text().includes("UNDO");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "UNDO")
    .click();
  await flush();
});
const undoRestored = text().toUpperCase().includes("INCLINE BARBELL PRESS");
await saveExercise("100.5");
const chestStretchExact = await captureStretch(
  "chest-stretch-info-approved.png",
  [
    "Use a bent-arm fly position.",
    "Keep back on bench, hips off edge, and chest high.",
    "Hold a safe, controlled stretch for 60–90 seconds.",
    "Stop for shoulder or joint pain.",
  ],
);
await completeStretch();

await act(async () =>
  document.querySelector('button[aria-label="LEAVE WORKOUT"]').click(),
);
const inProgressPreserved =
  text().includes("WORKOUT IN PROGRESS") && text().includes("RESUME A1");
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("RESUME A1"))
    .click(),
);
const resumedFirstUnfinished = text()
  .toUpperCase()
  .includes("STANDING BARBELL MILITARY PRESS");

await saveExercise();
const shoulderStretchExact = await captureStretch(
  "shoulder-stretch-illustration-approved.png",
  [
    "Set bar at shoulder height.",
    "Face away. Grip bar behind you, palms up.",
    "Sink down into the stretch.",
    "Roll shoulders down.",
    "Hold 60–90 seconds.",
    "Stop for joint pain.",
  ],
);
await completeStretch();
await saveExercise();
const tricepsStretchExact = await captureStretch(
  "triceps-stretch-info-approved.png",
  [
    "Sit with back supported.",
    "Lower one dumbbell behind your head.",
    "Keep elbow pointed up.",
    "Lean back slightly. Use the back of your head to gently deepen the stretch.",
    "Hold 60–90 seconds.",
    "Stop for joint pain.",
  ],
);
await completeStretch();
await saveExercise();
await saveStraightSets(["315", "225"], [8, 12]);
const backStretchExact = await captureStretch(
  "back-stretch-illustration-approved.png",
  [
    "Grip a fixed bar at chest height.",
    "Keep your arms straight.",
    "Sit your hips back.",
    "Round your upper back and pull away.",
    "Hold 45–60 seconds.",
    "Stop for shoulder or joint pain.",
  ],
);
await completeStretch();

const aStretchCopyExact =
  chestStretchExact &&
  shoulderStretchExact &&
  tricepsStretchExact &&
  backStretchExact;

const completionShown =
  text().includes("A1 COMPLETE") &&
  text().includes("NEXT WORKOUT") &&
  text().includes("B1") &&
  text().includes("UNDO LAST SAVE");
const finalSave = calls
  .filter((call) => call[0] === "rpc" && call[1] === "save_a1_workout_step")
  .at(-1);
await client.rpc(finalSave[1], finalSave[2]);
const retryAdvancedOnce =
  rotationAdvancements === 1 && rotationState.next_slot === "B1";
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "DONE")
    .click(),
);
const homeAdvancedOnce =
  text().includes("NEXT WORKOUT") &&
  text().includes("B1") &&
  [...document.querySelectorAll("button")].some(
    (button) => button.textContent.includes("START B1") && !button.disabled,
  );
const a1WorkoutCompletion =
  startedA1 &&
  responseLossRetried &&
  undoOffered &&
  undoRestored &&
  aStretchCopyExact &&
  inProgressPreserved &&
  resumedFirstUnfinished &&
  completionShown &&
  retryAdvancedOnce &&
  homeAdvancedOnce &&
  hasCall(
    "rpc",
    (call) =>
      JSON.stringify([call[1], call[2]?.p_weights?.[0], call[2]?.p_reps]) ===
      JSON.stringify([
        "save_a1_workout_step",
        { amount: "100.5", unit: "lb" },
        [8, 4, 2],
      ]),
  );

workoutResult = { data: null, error: null };
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("START B1"))
    .click();
  await flush();
});
const startedB1 =
  text().toUpperCase().includes("STRAIGHT-BAR CURL") && text().includes("1 OF 7");

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SKIP")
    .click();
  await flush();
});
const exerciseSkipRecorded =
  text().includes("SKIPPED") &&
  text().includes("UNDO") &&
  workoutSteps[0].status === "skipped" &&
  workoutSteps[0].weight_entries.length === 0;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "UNDO")
    .click();
  await flush();
});
const skipUndoRestored =
  text().toUpperCase().includes("STRAIGHT-BAR CURL") &&
  workoutSteps[0].status === "pending";

await saveExercise("80");
const bicepsStretchExact = await captureStretch(
  "biceps-stretch-illustration-approved.png",
  [
    "Set bar around neck height.",
    "Face away. Grip bar behind you, palms down.",
    "Sink down into the stretch.",
    "Hold 45–60 seconds.",
    "Stop for joint pain.",
  ],
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SKIP")
    .click();
  await flush();
});
const stretchSkipRecorded = workoutSteps[1].status === "skipped";

const previousMirrorsStructure =
  text().includes("PREVIOUS PERFORMANCE") &&
  document.querySelectorAll(".previous-card output").length === 2 &&
  document.querySelector(".previous-card input") === null &&
  text().includes("80 LB · 11 REPS") &&
  text().includes("60 LB · 20 REPS");
await saveStraightSets(["85", "65"], [12, 20]);

await act(async () =>
  document.querySelector('button[aria-label="CALF 10–12 INFORMATION"]').click(),
);
const calfRuntimePanel =
  text().includes("Lower slowly over 5 seconds.") &&
  text().includes("Hold the bottom position for 15 seconds.") &&
  text().includes("Explode upward onto your toes.") &&
  !document.querySelector('[role="dialog"]').textContent.toLowerCase().includes("timer");
await act(async () =>
  document
    .querySelector('button[aria-label="CLOSE CALF 10–12 INFORMATION"]')
    .click(),
);
await saveStraightSets(["100"], [12]);
await saveStraightSets(["120"], [12]);
const hamstringStretchExact = await captureStretch(
  "hamstring-stretch-illustration-approved.png",
  [
    "Place one heel on a high fixed bar.",
    "Hold your toe.",
    "Use your free hand to keep the leg straight.",
    "Hinge forward into the stretch.",
    "Hold 60 seconds.",
    "Stop for joint pain.",
  ],
);
await completeStretch();

const widowmakerSeparate =
  document.querySelectorAll('[id^="weight-"]').length === 2 &&
  document.querySelectorAll('[id^="rep-"]').length === 2 &&
  text().includes("SET 1") &&
  text().includes("SET 2");
await saveStraightSets(["225", "135"], [6, 20]);
const quadricepsStretchExact = await captureStretch(
  "quad-stretch-illustration-approved.png",
  [
    "Grip a fixed bar in front of you.",
    "Keep your knees off the floor.",
    "Drive knees and hips forward.",
    "Lean back into the stretch.",
    "Hold 45–60 seconds.",
    "Stop for knee or joint pain.",
  ],
);
await completeStretch();

const absStraightOnly =
  text().includes("ABS 1") &&
  document.querySelectorAll('[id^="weight-"]').length === 1 &&
  document.querySelectorAll('[id^="rep-"]').length === 1 &&
  document.getElementById("duration-seconds") === null;
await saveStraightSets(["50"], [20]);

await act(async () =>
  document.querySelector('button[aria-label="LEAVE WORKOUT"]').click(),
);
const bFinishLaterPreserved =
  text().includes("WORKOUT IN PROGRESS") && text().includes("RESUME B1");
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("RESUME B1"))
    .click(),
);
const timedHoldOnly =
  text().includes("ABS 2") &&
  text().includes("HOLD SECONDS") &&
  document.getElementById("duration-seconds") !== null &&
  document.querySelectorAll('[id^="rep-"]').length === 0 &&
  !text().includes("TARGET RANGE");
await setInput("weight-0", "25");
await setInput("duration-seconds", "60");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE & NEXT"))
    .click();
  await flush();
});

const bCompletionShown =
  text().includes("B1 COMPLETE") &&
  text().includes("NEXT WORKOUT") &&
  text().includes("A2") &&
  text().includes("UNDO LAST SAVE");
const finalBSave = calls
  .filter(
    (call) =>
      call[0] === "rpc" &&
      call[1] === "save_a1_workout_step" &&
      call[2]?.p_step_id === "workout-B1-step-10",
  )
  .at(-1);
await client.rpc(finalBSave[1], finalBSave[2]);
const bRetryAdvancedOnce =
  rotationAdvancements === 2 && rotationState.next_slot === "A2";
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "DONE")
    .click(),
);
const bHomeAdvanced =
  text().includes("NEXT WORKOUT") &&
  text().includes("A2") &&
  [...document.querySelectorAll("button")].some(
    (button) => button.textContent.includes("START A2") && !button.disabled,
  );
const entryShapeCalls = calls.filter(
  (call) => call[0] === "rpc" && call[1] === "save_a1_workout_step",
);
const savedShape = (stepId, weightCount, repCount, durationSeconds = null) =>
  entryShapeCalls.some(
    (call) =>
      call[2]?.p_step_id === stepId &&
      call[2]?.p_weights?.length === weightCount &&
      call[2]?.p_reps?.length === repCount &&
      call[2]?.p_duration_seconds === durationSeconds,
  );
const entryStructureMatrix = {
  custom: savedShape("workout-B1-step-3", 2, 2),
  multiple_straight: savedShape("workout-A1-step-8", 2, 2),
  rest_pause: savedShape("workout-A1-step-1", 1, 3),
  single_straight: savedShape("workout-B1-step-4", 1, 1),
  timed_hold: savedShape("workout-B1-step-10", 1, 0, 60),
  widowmaker: savedShape("workout-B1-step-7", 2, 2),
};
const entryStructureMatrixPassed = Object.values(entryStructureMatrix).every(
  Boolean,
);
const fullWorkoutRuntime =
  startedB1 &&
  exerciseSkipRecorded &&
  skipUndoRestored &&
  stretchSkipRecorded &&
  bicepsStretchExact &&
  hamstringStretchExact &&
  quadricepsStretchExact &&
  previousMirrorsStructure &&
  calfRuntimePanel &&
  widowmakerSeparate &&
  absStraightOnly &&
  bFinishLaterPreserved &&
  timedHoldOnly &&
  bCompletionShown &&
  bRetryAdvancedOnce &&
  bHomeAdvanced &&
  entryStructureMatrixPassed;

const behavior = {
  entry_structure_matrix: entryStructureMatrixPassed,
  full_workout_runtime: fullWorkoutRuntime,
  a1_workout_completion: a1WorkoutCompletion,
  a1_assignment_round_trip:
    emptyA1 &&
    approvedChestPool &&
    exerciseContinueDisabled &&
    protocolInitiallyEmpty &&
    protocolGuidance &&
    rangeInitiallyEmpty &&
    reviewComplete &&
    backPreserved &&
    savedExactlyOnce &&
    restoredAfterRemount &&
    replacementClearsDownstream,
  browser_safe_client:
    hasCall(
      "createClient",
      (call) =>
        call[1] === "https://example.supabase.co" &&
        call[2] === "publishable-test-key" &&
        call[3]?.autoRefreshToken === true &&
        call[3]?.detectSessionInUrl === true &&
        call[3]?.persistSession === true,
    ) && !JSON.stringify(calls).includes("service_role"),
  cold_start_offline:
    coldStartNoCloudRead &&
    coldOffline.includes("OFFLINE · SAVED ON DEVICE") &&
    coldSignOutDisabled === true,
  expired_recovery_explained: expiredRecoveryExplained,
  generic_sign_in_error: genericSignInError,
  mounted_application: mountedApplication,
  missing_profile_signed_out: missingProfileSignedOut,
  offline_sign_out_safe:
    offline.includes("OFFLINE · SAVED ON DEVICE") && signOutDisabled === true,
  protected_owner_record:
    hasCall("from", (call) => call[1] === "foundation_profiles") &&
    hasCall("select", (call) => call[1] === "status") &&
    hasCall("eq", (call) => call[1] === "user_id" && call[2] === "owner-1") &&
    signedOutReadBlocked,
  rotation_assignment_boundary:
    hasCall("from", (call) => call[1] === "rotation_assignment_versions") &&
    hasCall(
      "rpc",
      (call) =>
        JSON.stringify([
          call[1],
          call[2]?.p_slot,
          call[2]?.p_body_part,
          call[2]?.p_protocol,
          call[2]?.p_structure,
          call[2]?.p_target_sets,
        ]) ===
        JSON.stringify([
          "save_rotation_assignment",
          "A1",
          "chest",
          "rest_pause",
          "11-15",
          [{ min: 11, max: 15 }],
        ]),
    ),
  s02_rotation_setup:
    bPoolMatched &&
    bCustomReviewed &&
    calfInformationSheet &&
    fullAbsPool &&
    absProtocols &&
    completeReload &&
    s02CloudBoundaries,
  recovery_failure_retained: recoveryFailureRetained,
  recovery_rejects_mismatch: recoveryMismatchRejected,
  recovery_rejects_short_password: recoveryShortPasswordRejected,
  recovery_completed:
    recoveryShown &&
    recoveryExited &&
    hasCall(
      "updateUser",
      (call) => call[1]?.password === "correct-horse-battery-staple",
    ) &&
    hasCall("signOut", (call) => call[1]?.scope === "others") &&
    window.location.pathname === "/",
  reset_request_private:
    resetMessage &&
    hasCall(
      "resetPasswordForEmail",
      (call) =>
        call[1] === "owner@example.com" &&
        call[2]?.redirectTo ===
          "https://dc-training.test/account/update-password",
    ),
  session_restored:
    loading &&
    coldOffline.includes("NEXT WORKOUT") &&
    firstOnline.includes("PROTECTED"),
  sign_in_submitted: hasCall(
    "signInWithPassword",
    (call) =>
      call[1]?.email === "owner@example.com" &&
      call[1]?.password === "correct-horse-battery-staple",
  ),
  sign_out_submitted: signOutSubmitted,
  profile_error_handled: profileErrorHandled,
  reconnect_refetched: reconnectRefetched && reconnected.includes("SYNCED"),
};

const a1Detail = {
  a1WorkoutCompletion,
  completionShown,
  approvedChestPool,
  backPreserved,
  emptyA1,
  exerciseContinueDisabled,
  protocolGuidance,
  protocolInitiallyEmpty,
  rangeInitiallyEmpty,
  replacementClearsDownstream,
  resumedFirstUnfinished,
  retryAdvancedOnce,
  restoredAfterRemount,
  reviewComplete,
  savedExactlyOnce,
  startedA1,
  aStretchCopyExact,
  undoOffered,
  undoRestored,
  homeAdvancedOnce,
  inProgressPreserved,
};
const fullWorkoutDetail = {
  absStraightOnly,
  bCompletionShown,
  bFinishLaterPreserved,
  bHomeAdvanced,
  bRetryAdvancedOnce,
  calfRuntimePanel,
  exerciseSkipRecorded,
  entryStructureMatrix,
  previousMirrorsStructure,
  skipUndoRestored,
  startedB1,
  stretchSkipRecorded,
  bicepsStretchExact,
  hamstringStretchExact,
  quadricepsStretchExact,
  timedHoldOnly,
  widowmakerSeparate,
};

assert.deepEqual(
  Object.entries(behavior).filter(([, passed]) => !passed),
  [],
  `Every workout characterization behavior must pass: ${JSON.stringify({ a1Detail, fullWorkoutDetail })}`,
);

process.stdout.write(
  JSON.stringify({
    behavior,
    scenario: "foundation-shell",
    schema_version: "1.0",
  }),
);

function workoutSaveResponse(data) {
  if (!loseNextWorkoutSaveResponse) return { data, error: null };
  loseNextWorkoutSaveResponse = false;
  return { data: null, error: { message: "NETWORK RESPONSE LOST" } };
}
