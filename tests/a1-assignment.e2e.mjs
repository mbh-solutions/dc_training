import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const offlineSyncAvailable = existsSync(
  path.join(target, "src/offline-sync.ts"),
);
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
let lifecycleState = {
  blast_ended_at: null,
  blast_id: "blast-1",
  blast_started_at: "2026-06-01T10:00:00Z",
  cruise_started_at: null,
  phase: "blast",
  suggestion_dismissed: false,
  suggestion_due: false,
};
let workoutResult = { data: null, error: null };
let workoutSteps = [];
let historyMode = false;
let historyAssignments = [];
let historyWorkouts = [];
let historySteps = [];
let rotationAdvancements = 0;
let loseNextWorkoutSaveResponse = true;
let loseNextHistoryCorrectionResponse = true;
let failReloadAfterNextHistoryCorrection = false;
let failNextHistoryReload = false;
const workoutOperations = new Map();
const logbookOperations = new Map();
const historyCorrectionOperations = new Map();
const lifecycleOperations = new Map();
let loseNextCruiseResponse = true;
let logbookScenario = null;
let logbookWorkoutCount = 0;
let failNextReplacement = true;
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
  enforcement_action: null,
  exercise,
  fresh_baseline: true,
  kind: "exercise",
  last_operation_id: null,
  mulligan_used: false,
  ordinal,
  previous_duration_seconds: null,
  previous_reps: [],
  previous_weight_entries: [],
  protocol,
  reference_history: [],
  reps: [],
  resolution: null,
  set_verdicts: [],
  status: "pending",
  step_id: `${workout_id}-step-${ordinal}`,
  structure,
  target_sets,
  weight_entries: [],
  workout_id,
  verdict: null,
});

const stretchStep = (workout_id, body_part, ordinal) => ({
  assignment_id: null,
  body_part,
  duration_seconds: null,
  enforcement_action: null,
  exercise: null,
  fresh_baseline: false,
  kind: "stretch",
  last_operation_id: null,
  mulligan_used: false,
  ordinal,
  previous_duration_seconds: null,
  previous_reps: [],
  previous_weight_entries: [],
  protocol: null,
  reference_history: [],
  reps: [],
  resolution: null,
  set_verdicts: [],
  status: "pending",
  step_id: `${workout_id}-step-${ordinal}`,
  structure: null,
  target_sets: [],
  weight_entries: [],
  workout_id,
  verdict: null,
});

const workoutTemplate = (slot, workout_id) => {
  if (slot.startsWith("A")) {
    return [
      exerciseStep({
        body_part: "chest",
        exercise: "Incline barbell press",
        ordinal: 1,
        workout_id,
      }),
      stretchStep(workout_id, "chest", 2),
      exerciseStep({
        body_part: "shoulders",
        exercise: "Standing barbell military press",
        ordinal: 3,
        workout_id,
      }),
      stretchStep(workout_id, "shoulders", 4),
      exerciseStep({
        body_part: "triceps",
        exercise: "Close-grip barbell bench press",
        ordinal: 5,
        workout_id,
      }),
      stretchStep(workout_id, "triceps", 6),
      exerciseStep({
        body_part: "back_width",
        exercise: "Pull-ups",
        ordinal: 7,
        workout_id,
      }),
      exerciseStep({
        body_part: "back_thickness",
        exercise: "Conventional deadlift",
        ordinal: 8,
        protocol: "straight_set",
        structure: "deadlift-6-8-10-12",
        target_sets: [
          { max: 8, min: 6 },
          { max: 12, min: 10 },
        ],
        workout_id,
      }),
      stretchStep(workout_id, "back", 9),
    ];
  }
  return [
    exerciseStep({
      body_part: "biceps",
      exercise: "Straight-bar curl",
      ordinal: 1,
      workout_id,
    }),
    stretchStep(workout_id, "biceps", 2),
    exerciseStep({
      body_part: "forearms",
      exercise: "Alternating hammer curl",
      ordinal: 3,
      protocol: "straight_set",
      structure: "custom",
      target_sets: [
        { max: 12, min: 10 },
        { max: 20, min: 20 },
      ],
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
      target_sets: [
        { max: 6, min: 4 },
        { max: 20, min: 20 },
      ],
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

const logbookWorkoutTemplate = (scenario, workout_id) => {
  const step = exerciseStep({
    body_part: "chest",
    exercise: "Incline barbell press",
    ordinal: 1,
    workout_id,
  });
  step.assignment_id =
    scenario === "returned_baseline" || scenario === "new_blast_baseline"
      ? "assignment-returned-chest"
      : "assignment-logbook-chest";
  step.fresh_baseline =
    scenario === "returned_baseline" || scenario === "new_blast_baseline";
  step.mulligan_used = scenario === "second_failure";
  if (scenario === "returned_baseline" || scenario === "new_blast_baseline") {
    step.protocol = "straight_set";
    step.structure = "none";
    step.target_sets = [];
    step.reference_history = [
      {
        assignment_id:
          scenario === "new_blast_baseline"
            ? step.assignment_id
            : "assignment-retired-chest",
        duration_seconds: null,
        performed_at: "2026-06-01T10:00:00Z",
        protocol: "rest_pause",
        reps: [7, 3, 2],
        structure: "11-15",
        target_sets: [{ min: 11, max: 15 }],
        verdict: "win",
        weight_entries: [
          { amount: "95", micrograms: "43091275150", unit: "lb" },
        ],
      },
      {
        assignment_id:
          scenario === "new_blast_baseline"
            ? step.assignment_id
            : "assignment-retired-chest",
        duration_seconds: null,
        performed_at: "2026-07-01T10:00:00Z",
        protocol: "rest_pause",
        reps: [8, 4, 2],
        structure: "11-15",
        target_sets: [{ min: 11, max: 15 }],
        verdict: "failure",
        weight_entries: [
          { amount: "100", micrograms: "45359237000", unit: "lb" },
        ],
      },
    ];
  } else {
    step.previous_reps = [8, 4, 2];
    step.previous_weight_entries = [
      { amount: "100", micrograms: "45359237000", unit: "lb" },
    ];
  }
  return [step];
};

const applyMockLogbookVerdict = (step, scenario) => {
  step.set_verdicts = [];
  if (scenario === "win") {
    step.verdict = "win";
    step.enforcement_action = null;
    return;
  }
  if (scenario === "returned_baseline" || scenario === "new_blast_baseline") {
    step.verdict = null;
    step.enforcement_action = null;
    return;
  }
  if (scenario === "ambiguous") {
    step.verdict = null;
    step.enforcement_action = "abs_choice";
    return;
  }
  step.verdict = "failure";
  step.enforcement_action =
    scenario === "second_failure" ? "replacement_required" : "first_failure";
};

const finishLogbookResult = (step, complete) => {
  if (complete) {
    const completedSlot = workoutResult.data.slot;
    workoutResult.data = {
      ...workoutResult.data,
      completed_at: "2026-08-10T14:00:00Z",
      status: "completed",
    };
    rotationState = {
      last_completed_slot: completedSlot,
      next_slot: rotationOrder[completedSlot],
    };
    rotationAdvancements += 1;
  }
  return {
    completed_now: complete,
    next_slot: rotationState.next_slot,
    step,
    workout: workoutResult.data,
  };
};

const mockStartWorkout = () => {
  if (lifecycleState.phase === "cruise")
    return {
      data: null,
      error: { message: "Start a new blast before logging a DC workout" },
    };
  if (workoutResult.data) return workoutResult;
  const slot = rotationState.next_slot;
  const workout = {
    completed_at: null,
    slot,
    status: "in_progress",
    workout_id: logbookScenario
      ? `workout-logbook-${++logbookWorkoutCount}`
      : `workout-${slot}`,
  };
  workoutSteps = logbookScenario
    ? logbookWorkoutTemplate(logbookScenario, workout.workout_id)
    : workoutTemplate(slot, workout.workout_id);
  if (!logbookScenario && slot.startsWith("B")) {
    const previous = workoutSteps.find((step) => step.body_part === "forearms");
    previous.previous_weight_entries = [
      { amount: "80", micrograms: "36287389600", unit: "lb" },
      { amount: "60", micrograms: "27215542200", unit: "lb" },
    ];
    previous.previous_reps = [11, 20];
    previous.fresh_baseline = false;
  }
  workoutResult = { data: workout, error: null };
  return workoutResult;
};

const mockSaveWorkoutStep = (values) => {
  if (workoutOperations.has(values.p_operation_id)) {
    const step = workoutSteps.find(
      (item) =>
        item.step_id === workoutOperations.get(values.p_operation_id).stepId,
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
  step.last_operation_id = values.p_operation_id;
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
  if (logbookScenario) applyMockLogbookVerdict(step, logbookScenario);
  workoutSteps[stepIndex] = step;
  const completedNow = workoutSteps.every(
    (item) => item.status !== "pending" && item.enforcement_action === null,
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
    if (logbookScenario === "new_blast_baseline") {
      lifecycleState = { ...lifecycleState, suggestion_due: true };
    }
  }
  return workoutSaveResponse({
    completed_now: completedNow,
    next_slot: rotationState.next_slot,
    step,
    workout: workoutResult.data,
  });
};

const mockResolveLogbookAction = (values) => {
  if (logbookOperations.has(values.p_operation_id)) {
    return {
      data: logbookOperations.get(values.p_operation_id),
      error: null,
    };
  }
  const step = workoutSteps.find((item) => item.step_id === values.p_step_id);
  step.enforcement_action =
    values.p_action === "count_failure" ? "first_failure" : null;
  if (step.enforcement_action === null) step.last_operation_id = null;
  step.resolution = values.p_action;
  if (values.p_action === "count_win") step.verdict = "win";
  if (values.p_action === "count_failure") step.verdict = "failure";
  const data = finishLogbookResult(step, step.enforcement_action === null);
  logbookOperations.set(values.p_operation_id, data);
  return { data, error: null };
};

const mockReplaceFailedAssignment = (values) => {
  if (failNextReplacement) {
    failNextReplacement = false;
    return { data: null, error: { message: "REPLACEMENT RPC FAILED" } };
  }
  if (logbookOperations.has(values.p_operation_id)) {
    return {
      data: logbookOperations.get(values.p_operation_id),
      error: null,
    };
  }
  const step = workoutSteps.find((item) => item.step_id === values.p_step_id);
  step.enforcement_action = null;
  step.last_operation_id = null;
  step.resolution = "replaced";
  const data = {
    ...finishLogbookResult(step, true),
    assignment: {
      active: true,
      assignment_id: `replacement-${logbookWorkoutCount}`,
      body_part: step.body_part,
      exercise: values.p_exercise,
      protocol: values.p_protocol,
      replaced_assignment_id: step.assignment_id,
      slot: workoutResult.data.slot,
      structure: values.p_structure,
      target_sets: values.p_target_sets,
    },
  };
  logbookOperations.set(values.p_operation_id, data);
  return { data, error: null };
};

const mockUndoWorkoutStep = (values) => {
  const operation = workoutOperations.get(values.p_operation_id);
  const index = workoutSteps.findIndex(
    (item) => item.step_id === operation.stepId,
  );
  workoutSteps[index] = operation.before;
  return { data: workoutSteps[index], error: null };
};

const mockCorrectWorkoutPerformance = (values) => {
  if (historyCorrectionOperations.has(values.p_operation_id)) {
    return {
      data: historyCorrectionOperations.get(values.p_operation_id),
      error: null,
    };
  }
  const index = historySteps.findIndex(
    (step) => step.step_id === values.p_step_id,
  );
  const step = historySteps[index];
  step.weight_entries = values.p_weights;
  step.reps = values.p_reps;
  step.duration_seconds = values.p_duration_seconds;
  step.verdict = "win";
  step.fresh_baseline = false;
  const data = {
    recalculated_steps: historySteps.filter(
      (item) => item.assignment_id === step.assignment_id,
    ),
    state: null,
    step,
  };
  historyCorrectionOperations.set(values.p_operation_id, data);
  if (loseNextHistoryCorrectionResponse) {
    loseNextHistoryCorrectionResponse = false;
    return { data: null, error: { message: "NETWORK RESPONSE LOST" } };
  }
  if (failReloadAfterNextHistoryCorrection) {
    failReloadAfterNextHistoryCorrection = false;
    failNextHistoryReload = true;
  }
  return { data, error: null };
};

const mockSaveRotationAssignment = (values) => {
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
};

const mockTransitionTrainingLifecycle = (values) => {
  if (lifecycleOperations.has(values.p_operation_id)) {
    return {
      data: lifecycleOperations.get(values.p_operation_id),
      error: null,
    };
  }
  if (values.p_action === "start_cruise") {
    if (workoutResult.data?.status === "in_progress")
      return {
        data: null,
        error: { message: "Finish the active workout before starting cruise" },
      };
    lifecycleState = {
      ...lifecycleState,
      blast_ended_at: "2026-08-10T16:00:00Z",
      cruise_started_at: "2026-08-10T16:00:00Z",
      phase: "cruise",
      suggestion_due: false,
    };
  } else if (values.p_action === "start_new_blast") {
    lifecycleState = {
      ...lifecycleState,
      blast_ended_at: null,
      blast_id: "blast-2",
      blast_started_at: "2026-08-10T17:00:00Z",
      cruise_started_at: null,
      phase: "blast",
      suggestion_dismissed: false,
      suggestion_due: false,
    };
  } else {
    lifecycleState = {
      ...lifecycleState,
      suggestion_dismissed: true,
      suggestion_due: false,
    };
  }
  lifecycleOperations.set(
    values.p_operation_id,
    structuredClone(lifecycleState),
  );
  if (values.p_action === "start_cruise" && loseNextCruiseResponse) {
    loseNextCruiseResponse = false;
    return { data: null, error: { message: "NETWORK RESPONSE LOST" } };
  }
  return { data: lifecycleState, error: null };
};

const mockRpc = (name, values) => {
  const handler =
    {
      correct_workout_performance: mockCorrectWorkoutPerformance,
      replace_failed_assignment: mockReplaceFailedAssignment,
      resolve_logbook_action: mockResolveLogbookAction,
      save_a1_workout_step: mockSaveWorkoutStep,
      start_a1_workout: mockStartWorkout,
      transition_training_lifecycle: mockTransitionTrainingLifecycle,
      undo_a1_workout_step: mockUndoWorkoutStep,
    }[name] ?? mockSaveRotationAssignment;
  return handler(values);
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
    const selectedRows = () => {
      if (table === "training_lifecycle_state") return lifecycleState;
      if (historyMode)
        return table === "workouts"
          ? historyWorkouts
          : table === "rotation_assignment_versions"
            ? historyAssignments
            : historySteps.filter(
                (step) =>
                  !filters.workout_id || step.workout_id === filters.workout_id,
              );
      return table === "workout_steps"
        ? workoutSteps.filter(
            (step) =>
              !filters.workout_id || step.workout_id === filters.workout_id,
          )
        : assignmentResult.data;
    };
    const query = {
      select(columns, options) {
        calls.push(["select", columns, options]);
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
        if (table === "training_lifecycle_state") {
          return { data: lifecycleState, error: null };
        }
        if (table === "workout_rotation_state") {
          return { data: rotationState, error: null };
        }
        if (table === "workouts") {
          if (!historyMode)
            return {
              data:
                workoutResult.data &&
                (!filters.status ||
                  workoutResult.data.status === filters.status)
                  ? workoutResult.data
                  : null,
              error: workoutResult.error,
            };
          return {
            data:
              historyWorkouts.find(
                (workout) =>
                  (!filters.status || workout.status === filters.status) &&
                  (!filters.workout_id ||
                    workout.workout_id === filters.workout_id),
              ) ?? null,
            error: null,
          };
        }
        return assignmentResult;
      },
      order(column, options) {
        calls.push(["order", table, column, options]);
        return query;
      },
      range(from, to) {
        calls.push(["range", table, from, to]);
        if (historyMode && failNextHistoryReload) {
          failNextHistoryReload = false;
          return Promise.resolve({
            count: null,
            data: null,
            error: { message: "HISTORY RELOAD FAILED" },
          });
        }
        const rows = selectedRows();
        return Promise.resolve({
          count: rows.length,
          data: rows.slice(from, to + 1),
          error: null,
        });
      },
      then(resolve, reject) {
        const result = { data: selectedRows(), error: null };
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
    return mockRpc(name, values);
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
const workoutToggle = (workout) =>
  [...document.querySelectorAll("button.workout-toggle")].find((button) =>
    button.textContent.includes(`${workout} WORKOUT`),
  );

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
const coldRotationDisabled = [...document.querySelectorAll("button")].some(
  (button) => button.textContent.includes("ROTATION") && button.disabled,
);
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
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SIGN OUT")
    .click();
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
const styledBackAction =
  document.querySelector('button.back-action[aria-label="Back"] .back-chevron-frame path')
    ?.getAttribute("d") === "m15 5-7 7 7 7";
const assignmentCardsHaveNoArrow = [...document.querySelectorAll("button.assignment-card")]
  .every((card) => !card.querySelector("svg, b"));
const accordionStartsCollapsed = ["A1", "B1", "A2", "B2", "A3", "B3"].every(
  (workout) => workoutToggle(workout).getAttribute("aria-expanded") === "false",
);
await act(async () => workoutToggle("A1").click());
await act(async () => workoutToggle("B1").click());
const accordionKeepsOneWorkoutOpen =
  workoutToggle("A1").getAttribute("aria-expanded") === "false" &&
  workoutToggle("B1").getAttribute("aria-expanded") === "true" &&
  window.getComputedStyle(
    document.getElementById("workout-a1-assignments"),
  ).display === "none";
await act(async () => workoutToggle("A1").click());

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

await act(async () => workoutToggle("B1").click());
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

// prettier-ignore
if (
  offlineSyncAvailable &&
  process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION
) {
  const a1AssignmentRoundTrip =
    emptyA1 &&
    styledBackAction &&
    assignmentCardsHaveNoArrow &&
    accordionStartsCollapsed &&
    accordionKeepsOneWorkoutOpen &&
    approvedChestPool &&
    exerciseContinueDisabled &&
    protocolInitiallyEmpty &&
    protocolGuidance &&
    rangeInitiallyEmpty &&
    reviewComplete &&
    backPreserved &&
    savedExactlyOnce &&
    restoredAfterRemount &&
    replacementClearsDownstream;
  assert.equal(
    a1AssignmentRoundTrip,
    true,
    "The S08 React rotation setup must preserve the qualified round trip",
  );
  process.stdout.write(
    JSON.stringify({
      behavior: { a1_assignment_round_trip: a1AssignmentRoundTrip },
      scenario: "foundation-shell",
      schema_version: "1.0",
    }),
  );
} else {
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
const undoOffered =
  text().includes("FRESH BASELINE") && text().includes("UNDO");
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
  text().toUpperCase().includes("STRAIGHT-BAR CURL") &&
  text().includes("1 OF 7");

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
  !document
    .querySelector('[role="dialog"]')
    .textContent.toLowerCase()
    .includes("timer");
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
const entryStructureMatrixPassed =
  Object.values(entryStructureMatrix).every(Boolean);
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

const startLogbookScenario = async (scenario) => {
  logbookScenario = scenario;
  workoutResult = { data: null, error: null };
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("START"))
      .click();
    await flush();
  });
};
const finishLogbookScreen = async () => {
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "DONE")
      .click(),
  );
};

await startLogbookScenario("win");
await setInput("weight-0", "100");
await setInput("rep-0", "9");
await setInput("rep-1", "4");
await setInput("rep-2", "2");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE & NEXT"))
    .click();
  await flush();
});
const logbookWinShown =
  text().includes("COMPLETE") &&
  document.querySelector(".completion-verdict")?.textContent.includes("WIN");
await finishLogbookScreen();

await startLogbookScenario("ambiguous");
await saveExercise("100");
const ambiguousChoiceShown =
  text().includes("COUNT THIS RESULT") &&
  [...document.querySelectorAll(".logbook-actions button")].some(
    (button) => button.textContent.trim() === "COUNT AS FAILURE",
  );
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "COUNT AS FAILURE")
    .click();
  await flush();
});
await act(async () => authCallback("SIGNED_OUT", null));
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
await act(settleLoading);
const chainedFailureReloaded = text().includes("RESUME");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("RESUME"))
    .click();
  await flush();
});
const chainedFailureUndoOffered =
  text().includes("LOGBOOK FAILURE") && text().includes("UNDO SAVE");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "UNDO SAVE")
    .click();
  await flush();
});
const chainedFailureUndoRestored =
  text().toUpperCase().includes("INCLINE BARBELL PRESS") &&
  !text().includes("LOGBOOK FAILURE");
await saveExercise("100");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "COUNT AS WIN")
    .click();
  await flush();
});
await finishLogbookScreen();

await startLogbookScenario("first_failure");
await saveExercise("100");
const firstFailureButtons = [
  ...document.querySelectorAll(".logbook-actions button"),
].map((button) => button.textContent.trim());
const firstFailureBlocked =
  text().includes("LOGBOOK FAILURE") &&
  JSON.stringify(firstFailureButtons) ===
    JSON.stringify(["USE MULLIGAN", "REPLACE EXERCISE"]);
const pendingDecisionUndoOffered = text().includes("UNDO SAVE");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "UNDO SAVE")
    .click();
  await flush();
});
const pendingDecisionUndoRestored =
  text().toUpperCase().includes("INCLINE BARBELL PRESS") &&
  !text().includes("LOGBOOK FAILURE");
await saveExercise("100");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "USE MULLIGAN")
    .click();
  await flush();
});
const mulliganCall = calls
  .filter(
    (call) =>
      call[0] === "rpc" &&
      call[1] === "resolve_logbook_action" &&
      call[2]?.p_action === "use_mulligan",
  )
  .at(-1);
const advancementAfterMulligan = rotationAdvancements;
await client.rpc(mulliganCall[1], mulliganCall[2]);
const mulliganRetryIdempotent =
  rotationAdvancements === advancementAfterMulligan;
await finishLogbookScreen();

await startLogbookScenario("second_failure");
const mulliganMarked = text().includes("MULLIGAN USED");
await saveExercise("100");
const replacementButtons = [
  ...document.querySelectorAll(".logbook-actions button"),
].map((button) => button.textContent.trim());
const replacementRequired =
  text().includes("REPLACEMENT REQUIRED") &&
  JSON.stringify(replacementButtons) === JSON.stringify(["REPLACE EXERCISE"]);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "REPLACE EXERCISE")
    .click(),
);
const failedExerciseExcluded = ![
  ...document.querySelectorAll('input[name="exercise"]'),
].some((input) => input.value === "Incline barbell press");
await act(async () => document.querySelector('input[name="exercise"]').click());
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () =>
  document.querySelector('input[value="rest_pause"]').click(),
);
await act(async () =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click(),
);
await act(async () => document.querySelector('input[value="11-15"]').click());
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
const replacementFailureShown = text().includes("REPLACEMENT RPC FAILED");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SAVE")
    .click();
  await flush();
});
const replacementCompleted =
  text().includes("COMPLETE") &&
  hasCall("rpc", (call) => call[1] === "replace_failed_assignment");
const replacementCall = calls
  .filter(
    (call) => call[0] === "rpc" && call[1] === "replace_failed_assignment",
  )
  .at(-1);
const advancementAfterReplacement = rotationAdvancements;
await client.rpc(replacementCall[1], replacementCall[2]);
const replacementRetryIdempotent =
  rotationAdvancements === advancementAfterReplacement;
await finishLogbookScreen();

await startLogbookScenario("returned_baseline");
const returnedHistoryShown =
  text().includes("REASSIGNED / FRESH BASELINE") &&
  text().includes("PRIOR HISTORY PRESERVED") &&
  text().includes("2026-06-01") &&
  text().includes("95 LB · 7 / 3 / 2 REPS") &&
  text().includes("2026-07-01") &&
  text().includes("WORK SET") &&
  text().includes("100 LB · 8 / 4 / 2 REPS");
await saveStraightSets(["105"], [8]);
const returnedBaselineShown =
  text().includes("COMPLETE") &&
  document
    .querySelector(".completion-verdict")
    ?.textContent.includes("FRESH BASELINE");
await finishLogbookScreen();

const historyAssignment = ({
  active = true,
  assignment_id,
  body_part,
  created_at,
  exercise,
  protocol,
  slot,
  structure,
  target_sets,
}) => ({
  active,
  assignment_id,
  body_part,
  created_at,
  exercise,
  protocol,
  slot,
  structure,
  target_sets,
});
const historyWorkout = (
  workout_id,
  slot,
  started_at,
  status = "completed",
  blast_id = "blast-1",
) => ({
  blast_id,
  completed_at: status === "completed" ? started_at : null,
  slot,
  start_operation_id: `start-${workout_id}`,
  started_at,
  status,
  workout_id,
});
const historyWeight = (amount, unit = "lb") => ({
  amount,
  micrograms: String(
    BigInt(Math.round(Number(amount) * (unit === "lb" ? 2 : 4))) *
      BigInt(unit === "lb" ? 226796185 : 250000000),
  ),
  unit,
});
const historyStep = ({
  assignment,
  duration_seconds = null,
  fresh_baseline = false,
  ordinal = 1,
  reps,
  verdict,
  weights,
  workout_id,
}) => ({
  ...exerciseStep({
    body_part: assignment.body_part,
    exercise: assignment.exercise,
    ordinal,
    protocol: assignment.protocol,
    structure: assignment.structure,
    target_sets: assignment.target_sets,
    workout_id,
  }),
  assignment_id: assignment.assignment_id,
  duration_seconds,
  fresh_baseline,
  reps,
  status: "completed",
  step_id: `${workout_id}-${assignment.assignment_id}`,
  verdict,
  weight_entries: weights,
});

const restOld = historyAssignment({
  active: false,
  assignment_id: "history-rest-old",
  body_part: "chest",
  created_at: "2026-04-01T12:00:00Z",
  exercise: "Incline barbell press",
  protocol: "rest_pause",
  slot: "A1",
  structure: "11-15",
  target_sets: [{ max: 15, min: 11 }],
});
const restCurrent = historyAssignment({
  active: true,
  assignment_id: "history-rest-current",
  body_part: "chest",
  created_at: "2026-05-01T12:00:00Z",
  exercise: "Incline barbell press",
  protocol: "rest_pause",
  slot: "A1",
  structure: "11-15",
  target_sets: [{ max: 15, min: 11 }],
});
const straightCurrent = historyAssignment({
  active: true,
  assignment_id: "history-straight",
  body_part: "back_thickness",
  created_at: "2026-04-01T12:00:00Z",
  exercise: "Rack deadlift",
  protocol: "straight_set",
  slot: "A2",
  structure: "deadlift-6-8-10-12",
  target_sets: [
    { max: 8, min: 6 },
    { max: 12, min: 10 },
  ],
});
const straightOld = historyAssignment({
  active: false,
  assignment_id: "history-straight-old",
  body_part: "back_thickness",
  created_at: "2026-03-01T12:00:00Z",
  exercise: "Rack deadlift",
  protocol: "rest_pause",
  slot: "A2",
  structure: "11-15",
  target_sets: [{ max: 15, min: 11 }],
});
const shoulderCurrent = historyAssignment({
  active: true,
  assignment_id: "history-shoulder",
  body_part: "shoulders",
  created_at: "2026-04-01T12:00:00Z",
  exercise: "Standing barbell military press",
  protocol: "rest_pause",
  slot: "A1",
  structure: "11-15",
  target_sets: [{ max: 15, min: 11 }],
});
const timedRetired = historyAssignment({
  active: false,
  assignment_id: "history-timed-retired",
  body_part: "abs_2",
  created_at: "2026-03-01T12:00:00Z",
  exercise: "Front Plank",
  protocol: "timed_hold",
  slot: "B1",
  structure: "none",
  target_sets: [],
});
historyAssignments = [
  restOld,
  restCurrent,
  straightOld,
  straightCurrent,
  shoulderCurrent,
  timedRetired,
];
const assignmentsBeforeCorrection = JSON.stringify(historyAssignments);
historyWorkouts = [
  historyWorkout("history-apr-2", "A1", "2026-04-02T12:00:00Z"),
  historyWorkout("history-active", "B1", "2026-08-07T12:00:00Z", "in_progress"),
  historyWorkout("history-may-28", "A1", "2026-05-28T12:00:00Z"),
  historyWorkout("history-straight-1", "A2", "2026-04-04T12:00:00Z"),
  historyWorkout("history-apr-16", "A1", "2026-04-16T12:00:00Z"),
  historyWorkout("history-may-14", "A1", "2026-05-14T12:00:00Z"),
  historyWorkout("history-straight-old", "A2", "2026-03-20T12:00:00Z"),
  historyWorkout("history-straight-2", "A2", "2026-04-18T12:00:00Z"),
  historyWorkout("history-shoulder-old", "A1", "2026-04-20T12:00:00Z"),
  historyWorkout("history-timed-1", "B1", "2026-03-05T12:00:00Z"),
  historyWorkout("history-timed-2", "B1", "2026-03-19T12:00:00Z"),
];
historySteps = [
  historyStep({
    assignment: restOld,
    fresh_baseline: true,
    reps: [8, 4, 2],
    verdict: null,
    weights: [historyWeight("225")],
    workout_id: "history-apr-2",
  }),
  historyStep({
    assignment: restOld,
    reps: [7, 4, 2],
    verdict: "win",
    weights: [historyWeight("230")],
    workout_id: "history-apr-16",
  }),
  historyStep({
    assignment: restCurrent,
    fresh_baseline: true,
    reps: [8, 4, 2],
    verdict: null,
    weights: [historyWeight("205")],
    workout_id: "history-may-14",
  }),
  historyStep({
    assignment: restCurrent,
    reps: [7, 4, 2],
    verdict: "failure",
    weights: [historyWeight("210")],
    workout_id: "history-may-28",
  }),
  historyStep({
    assignment: straightOld,
    fresh_baseline: true,
    reps: [8, 4, 2],
    verdict: null,
    weights: [historyWeight("355")],
    workout_id: "history-straight-old",
  }),
  historyStep({
    assignment: straightCurrent,
    fresh_baseline: true,
    reps: [8, 12],
    verdict: null,
    weights: [historyWeight("365"), historyWeight("315")],
    workout_id: "history-straight-1",
  }),
  historyStep({
    assignment: straightCurrent,
    reps: [7, 11],
    verdict: "win",
    weights: [historyWeight("375"), historyWeight("325")],
    workout_id: "history-straight-2",
  }),
  historyStep({
    assignment: shoulderCurrent,
    fresh_baseline: true,
    reps: [8, 4, 2],
    verdict: null,
    weights: [historyWeight("95")],
    workout_id: "history-shoulder-old",
  }),
  historyStep({
    assignment: timedRetired,
    duration_seconds: 45,
    fresh_baseline: true,
    reps: [],
    verdict: null,
    weights: [historyWeight("20", "kg")],
    workout_id: "history-timed-1",
  }),
  historyStep({
    assignment: timedRetired,
    duration_seconds: 60,
    reps: [],
    verdict: "win",
    weights: [historyWeight("25", "kg")],
    workout_id: "history-timed-2",
  }),
  exerciseStep({
    body_part: "shoulders",
    exercise: shoulderCurrent.exercise,
    ordinal: 1,
    workout_id: "history-active",
  }),
];
historySteps.at(-1).assignment_id = shoulderCurrent.assignment_id;
historyMode = true;
const rotationBeforeCorrection = rotationAdvancements;
const historyNav = [...document.querySelectorAll("button")].find((button) =>
  button.textContent.includes("HISTORY"),
);
await act(async () => {
  historyNav.click();
  await flush();
});
await settleLoading();
const exercisesTabCaptured =
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ===
  "EXERCISES";
const groupButtons = [...document.querySelectorAll(".exercise-group-toggle")];
const chestGroup = groupButtons.find((button) =>
  button.textContent.includes("CHEST"),
);
const shoulderGroup = groupButtons.find((button) =>
  button.textContent.includes("SHOULDERS"),
);
const retiredInitiallyCollapsed = groupButtons.some(
  (button) =>
    button.textContent.includes("RETIRED EXERCISES") &&
    button.getAttribute("aria-expanded") === "false",
);
await act(async () => {
  chestGroup.click();
  await flush();
  shoulderGroup.click();
  await flush();
});
const oneGroupExpanded =
  chestGroup.getAttribute("aria-expanded") === "false" &&
  shoulderGroup.getAttribute("aria-expanded") === "true";

await setInput("history-search", "Rack deadlift");
await act(async () => {
  document
    .getElementById("history-search")
    .dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
  await flush();
});
const progressionSegments = [
  ...document.querySelectorAll(".exercise-performance .progression-segment"),
];
const mixedProtocolSegments =
  progressionSegments.length === 2 &&
  progressionSegments[0].textContent.includes("REST-PAUSE") &&
  progressionSegments[0].querySelectorAll(".bar-chart").length === 1 &&
  progressionSegments[1].textContent.includes("STRAIGHT-SET");
const straightSegment = progressionSegments[1];
const straightSetLanes =
  straightSegment.querySelectorAll(".line-chart").length === 2 &&
  straightSegment.querySelectorAll(".target-band").length === 0 &&
  text().includes("SET 1 · 6–8 REPS") &&
  text().includes("SET 2 · 10–12 REPS");
const straightCharts = straightSegment.querySelectorAll(".line-chart");
const absentStraightSetOmitted =
  straightCharts[0]?.querySelectorAll("circle").length === 2 &&
  straightCharts[1]?.querySelectorAll("circle").length === 2 &&
  !straightCharts[1]?.textContent.includes("0 LB");
await act(async () => {
  document.querySelector(".history-back").click();
  await flush();
});
await setInput("history-search", "Standing barbell military press");
await act(async () => {
  document
    .getElementById("history-search")
    .dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
  await flush();
});
const activeWorkoutCorrectionLocked =
  document.querySelector(".performance-rows button")?.disabled === true &&
  text().includes("FINISH ACTIVE WORKOUT TO CORRECT");
await act(async () => {
  document.querySelector(".history-back").click();
  await flush();
});
await setInput("history-search", "");
const chestToggle = [
  ...document.querySelectorAll(".exercise-group-toggle"),
].find((button) => button.textContent.includes("CHEST"));
await act(async () => {
  chestToggle.click();
  await flush();
  [...document.querySelectorAll(".exercise-row")]
    .find((button) => button.textContent.includes("Incline barbell press"))
    .click();
  await flush();
});
const restPauseChart =
  text().includes("TOTAL REPS") &&
  text().includes("210 LB") &&
  text().includes("7 / 4 / 2") &&
  text().includes("REASSIGNED") &&
  text().includes("FRESH BASELINE") &&
  document.querySelectorAll(".exercise-performance polyline").length === 2 &&
  document.querySelectorAll(".exercise-performance .target-band").length ===
    2 &&
  document.querySelectorAll(".exercise-performance .chart-date").length === 8;
const targetBands = [
  ...document.querySelectorAll(".exercise-performance .target-band"),
];
const scaledTargetBands =
  targetBands.length === 2 &&
  targetBands.every(
    (band) =>
      band.getAttribute("y") === "15" && band.getAttribute("height") === "8",
  );
await act(async () => {
  document.querySelector(".performance-rows button").click();
  await flush();
});
await setInput("correction-reps-0", "0");
const correctionCallsBeforeInvalidSubmit = calls.filter(
  (call) => call[0] === "rpc" && call[1] === "correct_workout_performance",
).length;
await act(async () => {
  document.querySelector(".correction-dialog .primary-action").click();
  await flush();
});
const invalidCorrectionBlocked =
  text().includes("ENTER VALID WEIGHT AND PERFORMANCE VALUES") &&
  calls.filter(
    (call) => call[0] === "rpc" && call[1] === "correct_workout_performance",
  ).length === correctionCallsBeforeInvalidSubmit;
await setInput("correction-reps-0", "8");
await act(async () => {
  document.querySelector(".correction-dialog .primary-action").click();
  await flush();
  await flush();
});
const lostCorrectionResponse =
  invalidCorrectionBlocked &&
  text().includes("NETWORK RESPONSE LOST") &&
  !text().includes("ENTER VALID WEIGHT AND PERFORMANCE VALUES") &&
  document.querySelector(".correction-dialog") !== null;
await setInput("correction-reps-0", "9");
await act(async () => {
  document.querySelector(".correction-dialog .primary-action").click();
  await flush();
  await flush();
});
const correctionCalls = calls.filter(
  (call) => call[0] === "rpc" && call[1] === "correct_workout_performance",
);
const correctionCall = correctionCalls.at(-1);
const correctionRecalculated =
  lostCorrectionResponse &&
  correctionCalls.length === 2 &&
  correctionCalls[0][2].p_operation_id !==
    correctionCalls[1][2].p_operation_id &&
  correctionCall?.[2]?.p_reps.join(",") === "9,4,2" &&
  rotationAdvancements === rotationBeforeCorrection &&
  JSON.stringify(historyAssignments) === assignmentsBeforeCorrection &&
  text().includes("CORRECTION SAVED · VERDICTS RECALCULATED") &&
  [...document.querySelectorAll(".performance-rows em")].some(
    (label) => label.textContent === "WIN",
  );
failReloadAfterNextHistoryCorrection = true;
await act(async () => {
  document.querySelector(".performance-rows button").click();
  await flush();
});
await setInput("correction-reps-0", "10");
await act(async () => {
  document.querySelector(".correction-dialog .primary-action").click();
  await flush();
  await flush();
});
const committedCorrectionReloadFailureShown =
  text().includes("CORRECTION SAVED · HISTORY REFRESH FAILED") &&
  document.querySelector(".correction-dialog") === null &&
  historySteps.find((step) => step.step_id === correctionCall[2].p_step_id)
    ?.reps[0] === 10;
await act(async () => {
  document.querySelector(".history-back").click();
  await flush();
});
const retiredToggle = [
  ...document.querySelectorAll(".exercise-group-toggle"),
].find((button) => button.textContent.includes("RETIRED EXERCISES"));
await act(async () => {
  retiredToggle.click();
  await flush();
  [...document.querySelectorAll(".exercise-row")]
    .find((button) => button.textContent.includes("Front Plank"))
    .click();
  await flush();
});
const timedHoldChart =
  text().includes("HOLD (SECONDS)") &&
  text().includes("25 KG × 60 SEC") &&
  document.querySelectorAll(".exercise-performance .target-band").length === 0;
const retiredDetailLabeled =
  document
    .querySelector(".exercise-performance > p")
    ?.textContent.includes("ABS 2 · RETIRED · TIMED-HOLD") === true;
await act(async () => {
  document.querySelector(".history-back").click();
  await flush();
  [...document.querySelectorAll('[role="tab"]')]
    .find((button) => button.textContent === "WORKOUTS")
    .click();
  await flush();
});
const workoutRows = [...document.querySelectorAll(".workout-row")];
const workoutsTabCaptured =
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ===
    "WORKOUTS" &&
  workoutRows[0]?.textContent.includes("IN PROGRESS") &&
  text().indexOf("MAY 2026") < text().indexOf("APRIL 2026");
await act(async () => {
  workoutRows[0].click();
  await flush();
});
const inProgressDetail =
  text().includes("B1 WORKOUT") && text().includes("IN PROGRESS");
const historyPagination = [
  "workouts",
  "rotation_assignment_versions",
  "workout_steps",
].every((table) =>
  calls.some(
    (call) =>
      call[0] === "range" &&
      call[1] === table &&
      call[2] === 0 &&
      call[3] === 99,
  ),
);

historyMode = false;
workoutResult = { data: null, error: null };
logbookScenario = null;
const rotationBeforeCruise = structuredClone(rotationState);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("HOME"))
    .click();
  await flush();
});
const startCruiseButton = () =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === "START CRUISE",
  );
await act(async () => {
  startCruiseButton().click();
  await flush();
});
const cruiseConfirmationNamesSlot =
  text().includes("START CRUISE?") &&
  text().includes(`${rotationState.next_slot} will remain your next workout`);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "CANCEL")
    .click();
  await flush();
});
const cruiseCancelPreserved =
  lifecycleState.phase === "blast" &&
  JSON.stringify(rotationState) === JSON.stringify(rotationBeforeCruise);
await act(async () => {
  startCruiseButton().click();
  await flush();
  document.querySelector(".bottom-sheet .primary-action").click();
  await flush();
});
const lostCruiseResponseShown = text().includes("NETWORK RESPONSE LOST");
await act(async () => {
  document.querySelector(".bottom-sheet .primary-action").click();
  await flush();
});
const cruiseCalls = calls.filter(
  (call) => call[0] === "rpc" && call[1] === "transition_training_lifecycle",
);
const cruiseRetryIdempotent =
  lostCruiseResponseShown &&
  cruiseCalls.length >= 2 &&
  cruiseCalls.at(-2)[2].p_operation_id === cruiseCalls.at(-1)[2].p_operation_id;
const cruiseHomeReadOnly =
  lifecycleState.phase === "cruise" &&
  document.querySelector(".cruise-phase")?.textContent === "CRUISE" &&
  document.querySelector(".cruise-title")?.textContent === "RECOVERY" &&
  document.querySelector(".cruise-card strong")?.textContent ===
    rotationState.next_slot &&
  text().includes("Your rotation and assignments are preserved") &&
  text().includes("START NEW BLAST") &&
  !text().includes(`START ${rotationState.next_slot}`) &&
  JSON.stringify(rotationState) === JSON.stringify(rotationBeforeCruise);
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
  await flush();
});
const cruiseOfflineMutationBlocked =
  window.navigator.onLine === false &&
  ![...document.querySelectorAll("button")].some(
    (button) =>
      button.textContent.includes("START NEW BLAST") && !button.disabled,
  );
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
  await flush();
});
historyMode = true;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("HISTORY"))
    .click();
  await flush();
});
await settleLoading();
const cruiseHistoryAvailable =
  document.querySelector(".history-header h1")?.textContent === "HISTORY";
const cruiseRotationUnavailable = [...document.querySelectorAll("button")].some(
  (button) => button.textContent.includes("ROTATION") && button.disabled,
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("HOME"))
    .click();
  await flush();
});
historyMode = false;
const cruisePersistsAfterHistory =
  document.querySelector(".cruise-title")?.textContent === "RECOVERY";
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("START NEW BLAST"))
    .click();
  await flush();
});
const newBlastPreservedRotation =
  lifecycleState.phase === "blast" &&
  lifecycleState.blast_id === "blast-2" &&
  text().includes(`START ${rotationState.next_slot}`) &&
  JSON.stringify(rotationState) === JSON.stringify(rotationBeforeCruise);

logbookScenario = "new_blast_baseline";
workoutResult = { data: null, error: null };
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) =>
      button.textContent.includes(`START ${rotationState.next_slot}`),
    )
    .click();
  await flush();
  await flush();
});
const newBlastFreshBaseline =
  text().includes("NEW BLAST / FRESH BASELINE") &&
  text().includes("PRIOR HISTORY PRESERVED");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SKIP")
    .click();
  await flush();
});
const cruiseSuggestionHiddenUntilHome =
  text().includes("COMPLETE") && !text().includes("IT'S BEEN 7 WEEKS");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "DONE")
    .click();
  await flush();
  await flush();
});
const sevenWeekSuggestionShown =
  text().includes("IT'S BEEN 7 WEEKS") && text().includes("CONSIDER A CRUISE");
const rotationBeforeDismiss = structuredClone(rotationState);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("NOT NOW"))
    .click();
  await flush();
});
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
  await flush();
});
const cruiseSuggestionDismissedForBlast =
  lifecycleState.suggestion_dismissed &&
  !text().includes("IT'S BEEN 7 WEEKS") &&
  JSON.stringify(rotationState) === JSON.stringify(rotationBeforeDismiss);

const blastCruiseRuntime =
  cruiseCancelPreserved &&
  cruiseConfirmationNamesSlot &&
  cruiseHistoryAvailable &&
  cruiseHomeReadOnly &&
  cruiseOfflineMutationBlocked &&
  cruisePersistsAfterHistory &&
  cruiseRotationUnavailable &&
  cruiseRetryIdempotent &&
  cruiseSuggestionDismissedForBlast &&
  cruiseSuggestionHiddenUntilHome &&
  newBlastFreshBaseline &&
  newBlastPreservedRotation &&
  sevenWeekSuggestionShown;

const historyRuntime =
  absentStraightSetOmitted &&
  activeWorkoutCorrectionLocked &&
  committedCorrectionReloadFailureShown &&
  exercisesTabCaptured &&
  historyPagination &&
  invalidCorrectionBlocked &&
  mixedProtocolSegments &&
  oneGroupExpanded &&
  retiredInitiallyCollapsed &&
  retiredDetailLabeled &&
  scaledTargetBands &&
  straightSetLanes &&
  restPauseChart &&
  correctionRecalculated &&
  timedHoldChart &&
  workoutsTabCaptured &&
  inProgressDetail;

const logbookRuntime =
  logbookWinShown &&
  ambiguousChoiceShown &&
  chainedFailureReloaded &&
  chainedFailureUndoOffered &&
  chainedFailureUndoRestored &&
  firstFailureBlocked &&
  pendingDecisionUndoOffered &&
  pendingDecisionUndoRestored &&
  mulliganRetryIdempotent &&
  mulliganMarked &&
  replacementRequired &&
  failedExerciseExcluded &&
  replacementFailureShown &&
  replacementCompleted &&
  replacementRetryIdempotent &&
  returnedHistoryShown &&
  returnedBaselineShown;

const behavior = {
  blast_cruise_runtime: blastCruiseRuntime,
  history_runtime: historyRuntime,
  logbook_enforcement_runtime: logbookRuntime,
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
  rotation_setup_accordion:
    accordionStartsCollapsed && accordionKeepsOneWorkoutOpen,
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
    coldOffline.includes("TRAINING STATUS") &&
    coldOffline.includes("TRAINING CONTROLS ARE LOCKED") &&
    coldRotationDisabled &&
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
  rotation_setup_back_action: styledBackAction,
  rotation_setup_cards_have_no_arrow: assignmentCardsHaveNoArrow,
};

const a1Detail = {
  a1WorkoutCompletion,
  accordionKeepsOneWorkoutOpen,
  accordionStartsCollapsed,
  completionShown,
  approvedChestPool,
  backPreserved,
  emptyA1,
  exerciseContinueDisabled,
  protocolGuidance,
  styledBackAction,
  assignmentCardsHaveNoArrow,
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
const logbookDetail = {
  ambiguousChoiceShown,
  chainedFailureReloaded,
  chainedFailureUndoOffered,
  chainedFailureUndoRestored,
  failedExerciseExcluded,
  firstFailureBlocked,
  logbookWinShown,
  mulliganMarked,
  mulliganRetryIdempotent,
  replacementCompleted,
  replacementRequired,
  replacementRetryIdempotent,
  returnedBaselineShown,
  returnedHistoryShown,
};
const historyDetail = {
  absentStraightSetOmitted,
  activeWorkoutCorrectionLocked,
  committedCorrectionReloadFailureShown,
  correctionRecalculated,
  exercisesTabCaptured,
  historyRuntime,
  historyPagination,
  invalidCorrectionBlocked,
  mixedProtocolSegments,
  inProgressDetail,
  oneGroupExpanded,
  retiredInitiallyCollapsed,
  retiredDetailLabeled,
  restPauseChart,
  scaledTargetBands,
  straightSetLanes,
  timedHoldChart,
  workoutsTabCaptured,
};
const blastCruiseDetail = {
  blastCruiseRuntime,
  cruiseCancelPreserved,
  cruiseConfirmationNamesSlot,
  cruiseHistoryAvailable,
  cruiseHomeReadOnly,
  cruiseOfflineMutationBlocked,
  cruisePersistsAfterHistory,
  cruiseRotationUnavailable,
  cruiseRetryIdempotent,
  cruiseSuggestionDismissedForBlast,
  cruiseSuggestionHiddenUntilHome,
  newBlastFreshBaseline,
  newBlastPreservedRotation,
  sevenWeekSuggestionShown,
};

assert.deepEqual(
  Object.entries(behavior).filter(([, passed]) => !passed),
  [],
  `Every workout characterization behavior must pass: ${JSON.stringify({ a1Detail, blastCruiseDetail, fullWorkoutDetail, historyDetail, logbookDetail })}`,
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
}
