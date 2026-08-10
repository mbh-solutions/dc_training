import { loadHistoryState, loadWorkoutState, type LoadedWorkout } from "./workout-api.js";
import {
  compareLogbookPerformance,
  sortHistoryWorkouts,
  type HistoryData,
  type HistoryWorkout,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";
import {
  assignmentKey,
  isAssignment,
  type Assignment,
} from "./rotation-assignment.js";
import {
  positionsFor,
  type AssignmentPosition,
  type Protocol,
  type TargetSet,
  type WorkoutSlot,
} from "./rotation-config.js";
import { supabase } from "./lib/supabase.js";
import { weightMicrograms, type WeightEntry } from "./weight-conversion.js";

type StepTarget = {
  ordinal?: number;
  step_id?: string;
  workout_operation_id?: string;
};
type AssignmentPayload = {
  body_part: AssignmentPosition;
  exercise: string;
  protocol: Protocol;
  slot: WorkoutSlot;
  structure: string;
  target_sets: TargetSet[];
};
export type OfflineOperationInput =
  | { id: string; kind: "start_workout"; payload: Record<string, never> }
  | {
      id: string;
      kind: "save_workout_step";
      payload: StepTarget & {
        duration_seconds: number | null;
        reps: number[];
        status: "completed" | "skipped";
        weights: WeightEntry[];
      };
    }
  | {
      id: string;
      kind: "undo_workout_step";
      payload: { original_operation_id: string };
    }
  | {
      id: string;
      kind: "resolve_logbook_action";
      payload: StepTarget & {
        action: "count_failure" | "count_win" | "use_mulligan";
      };
    }
  | {
      id: string;
      kind: "replace_failed_assignment";
      payload: AssignmentPayload & StepTarget;
    }
  | { id: string; kind: "save_rotation_assignment"; payload: AssignmentPayload }
  | {
      id: string;
      kind: "correct_history_performance";
      payload: StepTarget & {
        duration_seconds: number | null;
        reps: number[];
        weights: WeightEntry[];
      };
    }
  | {
      id: string;
      kind: "transition_training_lifecycle";
      payload: {
        action: "dismiss_suggestion" | "start_cruise" | "start_new_blast";
      };
    };

export type OfflineOperation = OfflineOperationInput & {
  createdAt: number;
  sequence: number;
  userId: string;
};

export type OfflineAccountState = {
  activeWorkoutStartOperationId: string | null;
  assignments: Record<string, Assignment>;
  history: HistoryData | null;
  queueSequence: number;
  recentOperation: {
    id: string;
    status: "baseline" | "completed" | "skipped" | "win";
  } | null;
  recentlyCompletedWorkout: Workout | null;
  updatedAt: string;
  userId: string;
  workout: LoadedWorkout | null;
};

const databaseName = "dc-training-offline";
const stateStore = "accounts";
const operationStore = "operations";
const memoryStates = new Map<string, OfflineAccountState>();
const memoryOperations = new Map<string, OfflineOperation>();
let memoryWrite = Promise.resolve();
let databasePromise: Promise<IDBDatabase> | null = null;

export function listenOfflineState(userId: string, listener: () => void) {
  const eventName = `dc-offline-state:${userId}`;
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

function emitOfflineState(userId: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(`dc-offline-state:${userId}`));
}

function emptyState(userId: string): OfflineAccountState {
  return {
    activeWorkoutStartOperationId: null,
    assignments: {},
    history: null,
    queueSequence: 0,
    recentOperation: null,
    recentlyCompletedWorkout: null,
    updatedAt: new Date(0).toISOString(),
    userId,
    workout: null,
  };
}

export async function readOfflineState(userId: string) {
  if (typeof indexedDB === "undefined") return memoryStates.get(userId) ?? null;
  const database = await openDatabase();
  const transaction = database.transaction(stateStore, "readonly");
  return ((await request(transaction.objectStore(stateStore).get(userId))) ??
    null) as OfflineAccountState | null;
}

export async function hasOfflineState(userId: string) {
  return Boolean(await readOfflineState(userId));
}

export async function commitOfflineOperation(
  userId: string,
  input: OfflineOperationInput,
) {
  if (typeof indexedDB === "undefined") return commitMemory(userId, input);
  const database = await openDatabase();
  const transaction = database.transaction(
    [stateStore, operationStore],
    "readwrite",
  );
  const states = transaction.objectStore(stateStore);
  const operations = transaction.objectStore(operationStore);
  const prior = (await request(operations.get(input.id))) as
    | OfflineOperation
    | undefined;
  if (prior) {
    if (prior.userId !== userId || !sameOperation(prior, input))
      throw new Error("OPERATION ID MISMATCH");
    const saved = (await request(states.get(userId))) as OfflineAccountState;
    await transactionDone(transaction);
    return saved;
  }
  const current =
    ((await request(states.get(userId))) as OfflineAccountState | undefined) ??
    emptyState(userId);
  const operation = completeOperation(current, userId, input);
  const next = reduceOfflineState(current, operation);
  next.queueSequence = operation.sequence;
  next.updatedAt = new Date(operation.createdAt).toISOString();
  states.put(next);
  operations.add(operation);
  await transactionDone(transaction);
  emitOfflineState(userId);
  return next;
}

function commitMemory(userId: string, input: OfflineOperationInput) {
  const work = memoryWrite.then(() => {
    const prior = memoryOperations.get(input.id);
    if (prior) {
      if (prior.userId !== userId || !sameOperation(prior, input))
        throw new Error("OPERATION ID MISMATCH");
      return memoryStates.get(userId)!;
    }
    const current = memoryStates.get(userId) ?? emptyState(userId);
    const operation = completeOperation(current, userId, input);
    const next = reduceOfflineState(current, operation);
    next.queueSequence = operation.sequence;
    next.updatedAt = new Date(operation.createdAt).toISOString();
    memoryStates.set(userId, next);
    memoryOperations.set(operation.id, operation);
    emitOfflineState(userId);
    return next;
  });
  memoryWrite = work.then(() => undefined, () => undefined);
  return work;
}

function completeOperation(
  state: OfflineAccountState,
  userId: string,
  input: OfflineOperationInput,
): OfflineOperation {
  return {
    ...input,
    createdAt: Date.now(),
    sequence: state.queueSequence + 1,
    userId,
  } as OfflineOperation;
}

function sameOperation(prior: OfflineOperation, input: OfflineOperationInput) {
  return (
    prior.kind === input.kind &&
    JSON.stringify(prior.payload) === JSON.stringify(input.payload)
  );
}

export async function pendingOfflineOperationCount(userId: string) {
  return (await listOfflineOperations(userId)).length;
}

export async function synchronizeOfflineState(userId: string) {
  if (!supabase) throw new Error("CLOUD IS NOT CONFIGURED");
  for (;;) {
    const operations = await listOfflineOperations(userId);
    for (const operation of operations) {
      const { error } = await supabase.rpc("apply_offline_operation", {
        p_kind: operation.kind,
        p_operation_id: operation.id,
        p_payload: operation.payload,
      });
      if (error) throw new Error(error.message);
      await deleteOfflineOperation(operation.id);
    }
    const cloud = await loadCloudState(userId);
    if (await replaceStateWhenQueueEmpty(cloud)) {
      emitOfflineState(userId);
      return;
    }
  }
}

async function loadCloudState(userId: string): Promise<OfflineAccountState> {
  const [workout, history, assignments] = await Promise.all([
    loadWorkoutState(userId),
    loadHistoryState(userId),
    loadCloudAssignments(userId),
  ]);
  if (!workout.data || !history.data || !assignments)
    throw new Error(
      workout.error || history.error || "OWNER DATA COULD NOT BE LOADED",
    );
  return {
    ...emptyState(userId),
    assignments,
    history: history.data,
    updatedAt: new Date().toISOString(),
    workout: workout.data,
  };
}

async function loadCloudAssignments(userId: string) {
  const { data, error } = await supabase!
    .from("rotation_assignment_versions")
    .select(
      "assignment_id,replaced_assignment_id,active,slot,body_part,exercise,protocol,structure,target_sets",
    )
    .eq("user_id", userId)
    .eq("active", true);
  if (error || !Array.isArray(data) || data.some((row) => !isAssignment(row)))
    return null;
  return Object.fromEntries(
    data.map((row) => [assignmentKey(row.slot, row.body_part), row]),
  );
}

async function replaceStateWhenQueueEmpty(state: OfflineAccountState) {
  if (typeof indexedDB === "undefined") {
    if (
      [...memoryOperations.values()].some(
        (item) => item.userId === state.userId,
      )
    )
      return false;
    memoryStates.set(
      state.userId,
      preserveLocalFeedback(state, memoryStates.get(state.userId)),
    );
    return true;
  }
  const database = await openDatabase();
  const transaction = database.transaction(
    [stateStore, operationStore],
    "readwrite",
  );
  const operations = transaction.objectStore(operationStore);
  const states = transaction.objectStore(stateStore);
  const queued = (await request(
    operations.index("userId").getAll(state.userId),
  )) as OfflineOperation[];
  if (queued.length > 0) {
    transaction.abort();
    return false;
  }
  const current = (await request(states.get(state.userId))) as
    | OfflineAccountState
    | undefined;
  states.put(preserveLocalFeedback(state, current));
  await transactionDone(transaction);
  return true;
}

function preserveLocalFeedback(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  return {
    ...cloud,
    queueSequence: local?.queueSequence ?? 0,
    recentOperation: local?.recentOperation ?? null,
    recentlyCompletedWorkout: local?.recentlyCompletedWorkout ?? null,
  };
}

async function listOfflineOperations(userId: string) {
  let operations: OfflineOperation[];
  if (typeof indexedDB === "undefined") {
    operations = [...memoryOperations.values()].filter(
      (operation) => operation.userId === userId,
    );
  } else {
    const database = await openDatabase();
    const transaction = database.transaction(operationStore, "readonly");
    operations = (await request(
      transaction.objectStore(operationStore).index("userId").getAll(userId),
    )) as OfflineOperation[];
  }
  return operations.sort((left, right) => left.sequence - right.sequence);
}

async function deleteOfflineOperation(operationId: string) {
  if (typeof indexedDB === "undefined") {
    memoryOperations.delete(operationId);
    return;
  }
  const database = await openDatabase();
  const transaction = database.transaction(operationStore, "readwrite");
  transaction.objectStore(operationStore).delete(operationId);
  await transactionDone(transaction);
}

export async function clearRecentCompletion(userId: string) {
  if (typeof indexedDB === "undefined") {
    const work = memoryWrite.then(() => {
      const state = memoryStates.get(userId);
      if (!state) return;
      memoryStates.set(userId, withoutRecentCompletion(state));
    });
    memoryWrite = work.then(
      () => undefined,
      () => undefined,
    );
    await work;
  } else {
    const database = await openDatabase();
    const transaction = database.transaction(stateStore, "readwrite");
    const states = transaction.objectStore(stateStore);
    const state = (await request(states.get(userId))) as
      | OfflineAccountState
      | undefined;
    if (state) states.put(withoutRecentCompletion(state));
    await transactionDone(transaction);
  }
  emitOfflineState(userId);
}

function withoutRecentCompletion(state: OfflineAccountState) {
  return {
    ...state,
    recentOperation: null,
    recentlyCompletedWorkout: null,
  };
}

export function stepTarget(
  state: OfflineAccountState,
  step: WorkoutStep,
): StepTarget {
  if (!step.step_id.startsWith("local:")) return { step_id: step.step_id };
  const workoutOperationId =
    localStartOperation(step.workout_id) ?? state.activeWorkoutStartOperationId;
  if (!workoutOperationId)
    throw new Error("LOCAL WORKOUT OPERATION IS MISSING");
  return {
    ordinal: step.ordinal,
    workout_operation_id: workoutOperationId,
  };
}

export function reduceOfflineState(
  current: OfflineAccountState,
  operation: OfflineOperation,
) {
  const state = JSON.parse(JSON.stringify(current)) as OfflineAccountState;
  switch (operation.kind) {
    case "start_workout":
      return startLocalWorkout(state, operation);
    case "save_workout_step":
      return saveLocalStep(state, operation);
    case "undo_workout_step":
      return undoLocalStep(state, operation);
    case "resolve_logbook_action":
      return resolveLocalLogbook(state, operation);
    case "replace_failed_assignment":
      return replaceLocalAssignment(state, operation);
    case "save_rotation_assignment":
      return saveLocalAssignment(state, operation);
    case "correct_history_performance":
      return correctLocalHistory(state, operation);
    case "transition_training_lifecycle":
      return transitionLocalLifecycle(state, operation);
  }
}

function startLocalWorkout(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "start_workout" }>,
) {
  if (!state.workout || !state.history)
    throw new Error("OWNER DATA IS NOT AVAILABLE ON THIS DEVICE");
  if (state.workout.lifecycle.phase !== "blast")
    throw new Error("WORKOUTS REQUIRE AN ACTIVE BLAST");
  if (state.workout.workout)
    throw new Error("WORKOUT IS ALREADY IN PROGRESS");
  const slot = state.workout.nextSlot;
  const assignments = positionsFor(slot).map(
    (position) => state.assignments[assignmentKey(slot, position)],
  );
  if (assignments.some((assignment) => !assignment))
    throw new Error(`${slot} REQUIRES SAVED ASSIGNMENTS`);
  const startedAt = new Date(operation.createdAt).toISOString();
  const workout: HistoryWorkout = {
    completed_at: null,
    slot,
    started_at: startedAt,
    status: "in_progress",
    workout_id: `local:${operation.id}`,
  };
  const steps = buildLocalSteps(
    state,
    workout,
    assignments as Assignment[],
    operation.id,
  );
  state.activeWorkoutStartOperationId = operation.id;
  state.workout.workout = workout;
  state.workout.steps = steps;
  state.history.workouts = sortHistoryWorkouts([
    workout,
    ...state.history.workouts,
  ]);
  state.history.steps.push(...steps);
  state.recentOperation = null;
  state.recentlyCompletedWorkout = null;
  return state;
}

const stepOrder: Record<"A" | "B", [string, "exercise" | "stretch", number][]> = {
  A: [
    ["chest", "exercise", 1],
    ["chest", "stretch", 2],
    ["shoulders", "exercise", 3],
    ["shoulders", "stretch", 4],
    ["triceps", "exercise", 5],
    ["triceps", "stretch", 6],
    ["back_width", "exercise", 7],
    ["back_thickness", "exercise", 8],
    ["back", "stretch", 9],
  ],
  B: [
    ["biceps", "exercise", 1],
    ["biceps", "stretch", 2],
    ["forearms", "exercise", 3],
    ["calves", "exercise", 4],
    ["hamstrings", "exercise", 5],
    ["hamstrings", "stretch", 6],
    ["quadriceps", "exercise", 7],
    ["quadriceps", "stretch", 8],
    ["abs_1", "exercise", 9],
    ["abs_2", "exercise", 10],
  ],
};

function buildLocalSteps(
  state: OfflineAccountState,
  workout: HistoryWorkout,
  assignments: Assignment[],
  operationId: string,
) {
  const byPart = new Map(assignments.map((item) => [item.body_part, item]));
  return stepOrder[workout.slot[0] as "A" | "B"].map(
    ([bodyPart, kind, ordinal]) => {
      const assignment =
        kind === "exercise"
          ? byPart.get(bodyPart as AssignmentPosition)!
          : null;
      return buildLocalStep(
        state,
        workout,
        assignment,
        bodyPart,
        kind,
        ordinal,
        operationId,
      );
    },
  );
}

function buildLocalStep(
  state: OfflineAccountState,
  workout: HistoryWorkout,
  assignment: Assignment | null,
  bodyPart: string,
  kind: "exercise" | "stretch",
  ordinal: number,
  operationId: string,
): WorkoutStep {
  const previous = assignment ? previousPerformance(state, assignment) : null;
  const freshBaseline = assignment !== null && previous?.currentBlast === null;
  return {
    assignment_id: assignment?.assignment_id ?? null,
    body_part: bodyPart,
    duration_seconds: null,
    enforcement_action: null,
    exercise: assignment?.exercise ?? null,
    fresh_baseline: freshBaseline,
    kind,
    last_operation_id: null,
    mulligan_used: previous?.currentBlast?.mulligan_used ?? false,
    ordinal,
    previous_duration_seconds: previous?.currentBlast?.duration_seconds ?? null,
    previous_reps: previous?.currentBlast?.reps ?? [],
    previous_weight_entries: previous?.currentBlast?.weight_entries ?? [],
    protocol: assignment?.protocol ?? null,
    reference_history: previous?.reference ?? [],
    reps: [],
    resolution: null,
    set_verdicts: [],
    status: "pending",
    step_id: `local:${operationId}:${ordinal}`,
    structure: assignment?.structure ?? null,
    target_sets: assignment?.target_sets ?? [],
    weight_entries: [],
    workout_id: workout.workout_id,
    verdict: null,
  };
}

function previousPerformance(
  state: OfflineAccountState,
  assignment: Assignment,
) {
  const history = state.history!;
  const workouts = new Map(history.workouts.map((item) => [item.workout_id, item]));
  const completed = history.steps
    .filter(
      (step) =>
        step.assignment_id === assignment.assignment_id &&
        step.status === "completed",
    )
    .sort((left, right) =>
      Date.parse(workouts.get(left.workout_id)?.started_at ?? "") -
        Date.parse(workouts.get(right.workout_id)?.started_at ?? "") ||
      left.ordinal - right.ordinal,
    );
  const blastStart = Date.parse(state.workout!.lifecycle.blast_started_at ?? "");
  const currentBlast =
    completed
      .filter(
        (step) =>
          Date.parse(workouts.get(step.workout_id)?.started_at ?? "") >=
          blastStart,
      )
      .at(-1) ?? null;
  const relatedIds = new Set(
    history.assignments
      .filter(
        (item) =>
          item.slot === assignment.slot &&
          item.body_part === assignment.body_part &&
          item.exercise === assignment.exercise,
      )
      .map((item) => item.assignment_id),
  );
  return {
    currentBlast,
    reference:
      currentBlast === null
        ? history.steps
            .filter(
              (step) =>
                relatedIds.has(step.assignment_id ?? "") &&
                step.status === "completed",
            )
            .map((step) => historyEntry(history, step))
            .sort(
              (left, right) =>
                Date.parse(left.performed_at) - Date.parse(right.performed_at),
            )
        : [],
  };
}

function historyEntry(history: HistoryData, step: WorkoutStep) {
  const assignment = history.assignments.find(
    (item) => item.assignment_id === step.assignment_id,
  )!;
  const workout = history.workouts.find(
    (item) => item.workout_id === step.workout_id,
  )!;
  return {
    assignment_id: assignment.assignment_id,
    duration_seconds: step.duration_seconds,
    performed_at: workout.started_at,
    protocol: assignment.protocol,
    reps: step.reps,
    structure: assignment.structure,
    target_sets: assignment.target_sets,
    verdict: step.verdict,
    weight_entries: step.weight_entries,
  };
}

function saveLocalStep(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "save_workout_step" }>,
) {
  if (!state.workout?.workout || !state.history)
    throw new Error("WORKOUT IS NOT IN PROGRESS");
  const index = targetStepIndex(state.workout.steps, operation.payload);
  const step = state.workout.steps[index];
  if (!step || step.status !== "pending")
    throw new Error("WORKOUT STEP IS NOT AVAILABLE");
  if (
    state.workout.steps.some(
      (item) => item.ordinal < step.ordinal && item.status === "pending",
    )
  )
    throw new Error("COMPLETE THE FIRST UNFINISHED STEP");
  if (state.workout.steps.some((item) => item.enforcement_action !== null))
    throw new Error("RESOLVE THE LOGBOOK DECISION FIRST");
  const next = applyStepPerformance(step, operation);
  state.workout.steps[index] = next;
  replaceHistoryStep(state.history, next);
  state.recentOperation = {
    id: operation.id,
    status: operationStatus(next),
  };
  return finishLocalWorkout(state, operation.createdAt);
}

function applyStepPerformance(
  step: WorkoutStep,
  operation: Extract<OfflineOperation, { kind: "save_workout_step" }>,
) {
  const next = { ...step, last_operation_id: operation.id };
  next.status = operation.payload.status;
  if (operation.payload.status === "skipped" || step.kind === "stretch")
    return next;
  next.weight_entries = operation.payload.weights.map(normalizeWeight);
  next.reps = operation.payload.reps;
  next.duration_seconds = operation.payload.duration_seconds;
  const comparison = compareLogbookPerformance({
    bodyPart: step.body_part,
    current: {
      durationSeconds: next.duration_seconds,
      reps: next.reps,
      weights: next.weight_entries,
    },
    previous: step.fresh_baseline
      ? null
      : {
          durationSeconds: step.previous_duration_seconds,
          reps: step.previous_reps,
          weights: step.previous_weight_entries,
        },
    protocol: step.protocol!,
    targetSets: step.target_sets,
  });
  next.set_verdicts = comparison.setVerdicts;
  next.verdict =
    comparison.verdict === "win"
      ? "win"
      : comparison.verdict === "failure"
        ? "failure"
        : null;
  next.enforcement_action = localEnforcement(next, comparison.verdict);
  return next;
}

function normalizeWeight(weight: WeightEntry) {
  const micrograms = weightMicrograms(weight);
  if (micrograms === null) throw new Error("INVALID WEIGHT");
  return { ...weight, micrograms: micrograms.toString() };
}

function localEnforcement(step: WorkoutStep, verdict: string) {
  if (verdict === "ambiguous") return "abs_choice" as const;
  if (verdict !== "failure") return null;
  return step.mulligan_used
    ? ("replacement_required" as const)
    : ("first_failure" as const);
}

function finishLocalWorkout(state: OfflineAccountState, createdAt: number) {
  const workout = state.workout!;
  if (
    workout.steps.some(
      (step) => step.status === "pending" || step.enforcement_action,
    )
  )
    return state;
  const completed = {
    ...workout.workout!,
    completed_at: new Date(createdAt).toISOString(),
    status: "completed" as const,
  };
  workout.lastCompletedSlot = completed.slot;
  workout.nextSlot = nextSlot(completed.slot);
  workout.workout = null;
  workout.steps = [];
  state.recentlyCompletedWorkout = completed;
  state.activeWorkoutStartOperationId = null;
  const historyWorkout = state.history!.workouts.find(
    (item) => item.workout_id === completed.workout_id,
  );
  if (historyWorkout) Object.assign(historyWorkout, completed);
  state.history!.workouts = sortHistoryWorkouts(state.history!.workouts);
  return state;
}

function resolveLocalLogbook(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "resolve_logbook_action" }>,
) {
  if (!state.workout?.workout || !state.history)
    throw new Error("WORKOUT IS NOT IN PROGRESS");
  const index = targetStepIndex(state.workout.steps, operation.payload);
  const step = state.workout.steps[index];
  if (!step?.enforcement_action)
    throw new Error("LOGBOOK DECISION IS NOT PENDING");
  if (operation.payload.action === "count_win") step.verdict = "win";
  if (operation.payload.action === "count_failure") {
    step.verdict = "failure";
    step.enforcement_action = step.mulligan_used
      ? "replacement_required"
      : "first_failure";
  } else {
    step.enforcement_action = null;
    if (operation.payload.action === "use_mulligan") step.mulligan_used = true;
  }
  step.resolution = operation.payload.action;
  step.last_operation_id = step.enforcement_action ? step.last_operation_id : null;
  if (step.enforcement_action === null) state.recentOperation = null;
  replaceHistoryStep(state.history, step);
  return finishLocalWorkout(state, operation.createdAt);
}

function replaceLocalAssignment(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "replace_failed_assignment" }>,
) {
  if (!state.workout?.workout || !state.history)
    throw new Error("WORKOUT IS NOT IN PROGRESS");
  const index = targetStepIndex(state.workout.steps, operation.payload);
  const step = state.workout.steps[index];
  if (
    !step ||
    !["first_failure", "replacement_required"].includes(
      step.enforcement_action ?? "",
    )
  )
    throw new Error("EXERCISE REPLACEMENT IS NOT PENDING");
  saveAssignmentRecord(state, operation, step.assignment_id);
  step.enforcement_action = null;
  step.last_operation_id = null;
  step.resolution = "replaced";
  state.recentOperation = null;
  replaceHistoryStep(state.history, step);
  return finishLocalWorkout(state, operation.createdAt);
}

function saveLocalAssignment(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "save_rotation_assignment" }>,
) {
  if (!state.history || !state.workout)
    throw new Error("OWNER DATA IS NOT AVAILABLE ON THIS DEVICE");
  if (state.workout.lifecycle.phase !== "blast")
    throw new Error("ROTATION CHANGES REQUIRE AN ACTIVE BLAST");
  const key = assignmentKey(
    operation.payload.slot,
    operation.payload.body_part,
  );
  const current = state.assignments[key];
  if (
    current?.exercise === operation.payload.exercise &&
    current.protocol === operation.payload.protocol &&
    current.structure === operation.payload.structure &&
    JSON.stringify(current.target_sets) ===
      JSON.stringify(operation.payload.target_sets)
  )
    return state;
  if (
    current &&
    state.workout.steps.some((step) => step.assignment_id === current.assignment_id)
  )
    throw new Error("FINISH THE ACTIVE WORKOUT BEFORE CHANGING THIS ASSIGNMENT");
  saveAssignmentRecord(state, operation, current?.assignment_id ?? null);
  return state;
}

function saveAssignmentRecord(
  state: OfflineAccountState,
  operation: Extract<
    OfflineOperation,
    { kind: "replace_failed_assignment" | "save_rotation_assignment" }
  >,
  replacedAssignmentId: string | null,
) {
  const key = assignmentKey(operation.payload.slot, operation.payload.body_part);
  const current = state.assignments[key];
  if (current) {
    const historyCurrent = state.history!.assignments.find(
      (item) => item.assignment_id === current.assignment_id,
    );
    if (historyCurrent) historyCurrent.active = false;
  }
  const assignment: Assignment = {
    active: true,
    assignment_id: `local:${operation.id}`,
    body_part: operation.payload.body_part,
    exercise: operation.payload.exercise,
    protocol: operation.payload.protocol,
    replaced_assignment_id: replacedAssignmentId,
    slot: operation.payload.slot,
    structure: operation.payload.structure,
    target_sets: operation.payload.target_sets,
  };
  state.assignments[key] = assignment;
  state.history!.assignments.push({
    ...assignment,
    created_at: new Date(operation.createdAt).toISOString(),
  });
}

function correctLocalHistory(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "correct_history_performance" }>,
) {
  if (!state.history) throw new Error("HISTORY IS NOT AVAILABLE ON THIS DEVICE");
  const index = targetStepIndex(state.history.steps, operation.payload);
  const step = state.history.steps[index];
  if (!step || step.kind !== "exercise" || step.status !== "completed")
    throw new Error("COMPLETED PERFORMANCE WAS NOT FOUND");
  step.weight_entries = operation.payload.weights.map(normalizeWeight);
  step.reps = operation.payload.reps;
  step.duration_seconds = operation.payload.duration_seconds;
  step.last_operation_id = operation.id;
  const activeIndex = state.workout?.steps.findIndex(
    (item) => item.step_id === step.step_id,
  );
  if (activeIndex !== undefined && activeIndex >= 0)
    state.workout!.steps[activeIndex] = step;
  return state;
}

function transitionLocalLifecycle(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "transition_training_lifecycle" }>,
) {
  if (!state.workout)
    throw new Error("TRAINING PHASE IS NOT AVAILABLE ON THIS DEVICE");
  const action = operation.payload.action;
  const current = state.workout.lifecycle;
  const now = new Date(operation.createdAt).toISOString();
  if (action === "start_cruise") {
    if (current.phase !== "blast" || state.workout.workout)
      throw new Error("CRUISE CANNOT START NOW");
    state.workout.lifecycle = {
      ...current,
      blast_ended_at: now,
      cruise_started_at: now,
      phase: "cruise",
      suggestion_due: false,
    };
  } else if (action === "start_new_blast") {
    if (current.phase !== "cruise")
      throw new Error("NEW BLAST CANNOT START NOW");
    state.workout.lifecycle = {
      blast_ended_at: null,
      blast_id: `local:${operation.id}`,
      blast_started_at: now,
      cruise_started_at: null,
      phase: "blast",
      suggestion_dismissed: false,
      suggestion_due: false,
    };
  } else {
    if (current.phase !== "blast" || !current.suggestion_due)
      throw new Error("CRUISE SUGGESTION IS NOT ACTIVE");
    state.workout.lifecycle = {
      ...current,
      suggestion_dismissed: true,
      suggestion_due: false,
    };
  }
  return state;
}

function undoLocalStep(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "undo_workout_step" }>,
) {
  if (!state.history || !state.workout)
    throw new Error("WORKOUT DATA IS NOT AVAILABLE ON THIS DEVICE");
  const step = state.history.steps.find(
    (item) => item.last_operation_id === operation.payload.original_operation_id,
  );
  if (!step) throw new Error("UNDO TARGET WAS NOT FOUND");
  Object.assign(step, {
    duration_seconds: null,
    enforcement_action: null,
    last_operation_id: null,
    reps: [],
    resolution: null,
    set_verdicts: [],
    status: "pending",
    verdict: null,
    weight_entries: [],
  });
  const historyWorkout = state.history.workouts.find(
    (item) => item.workout_id === step.workout_id,
  );
  if (!historyWorkout) throw new Error("UNDO WORKOUT WAS NOT FOUND");
  historyWorkout.status = "in_progress";
  historyWorkout.completed_at = null;
  state.workout.workout = historyWorkout;
  state.workout.steps = state.history.steps
    .filter((item) => item.workout_id === step.workout_id)
    .sort((left, right) => left.ordinal - right.ordinal);
  state.workout.nextSlot = historyWorkout.slot;
  state.workout.lastCompletedSlot = latestCompletedSlot(state.history, step.workout_id);
  state.activeWorkoutStartOperationId = localStartOperation(historyWorkout.workout_id);
  state.recentOperation = null;
  state.recentlyCompletedWorkout = null;
  return state;
}

function targetStepIndex(steps: WorkoutStep[], target: StepTarget) {
  if (target.step_id)
    return steps.findIndex((step) => step.step_id === target.step_id);
  return steps.findIndex(
    (step) =>
      step.ordinal === target.ordinal &&
      localStartOperation(step.workout_id) === target.workout_operation_id,
  );
}

function replaceHistoryStep(history: HistoryData, step: WorkoutStep) {
  const index = history.steps.findIndex((item) => item.step_id === step.step_id);
  if (index >= 0) history.steps[index] = step;
}

function latestCompletedSlot(history: HistoryData, excludedWorkoutId: string) {
  return history.workouts.find(
    (item) =>
      item.workout_id !== excludedWorkoutId && item.status === "completed",
  )?.slot ?? null;
}

function localStartOperation(workoutId: string) {
  return workoutId.startsWith("local:") ? workoutId.slice(6) : null;
}

function nextSlot(slot: WorkoutSlot): WorkoutSlot {
  const sequence: WorkoutSlot[] = ["A1", "B1", "A2", "B2", "A3", "B3"];
  return sequence[(sequence.indexOf(slot) + 1) % sequence.length];
}

function operationStatus(step: WorkoutStep) {
  if (step.status === "skipped") return "skipped" as const;
  if (step.verdict === "win") return "win" as const;
  if (step.fresh_baseline) return "baseline" as const;
  return "completed" as const;
}

function openDatabase() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(databaseName, 1);
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(stateStore))
        database.createObjectStore(stateStore, { keyPath: "userId" });
      if (!database.objectStoreNames.contains(operationStore)) {
        const store = database.createObjectStore(operationStore, {
          keyPath: "id",
        });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => resolve(opening.result);
  });
  return databasePromise;
}

function request<T = unknown>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onerror = () => reject(value.error);
    value.onsuccess = () => resolve(value.result);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
