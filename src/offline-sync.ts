import {
  loadHistoryState,
  loadWorkoutState,
  type LoadedWorkout,
} from "./workout-api.js";
import {
  compareLogbookPerformance,
  progressionOrder,
  sortHistoryWorkouts,
  type HistoryData,
  type HistoryWorkout,
  type TrainingLifecycle,
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
import {
  weightMicrograms,
  type WeightEntry,
  type WeightUnit,
} from "./weight-conversion.js";

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
type RotationAssignmentPayload = AssignmentPayload & {
  expected_assignment_id: string | null;
};
type AssignmentLogbookState =
  "first_failure_pending" | "mulligan_used" | "replacement_required";
export type PerformanceSnapshot = {
  duration_seconds: number | null;
  reps: number[];
  weights: WeightEntry[];
};
type StartWorkoutPayload = {
  assignments: Record<string, string>;
  blast_id: string;
  previous_workout_operation_id: string | null;
  slot: WorkoutSlot;
};
type LifecycleTransitionAction =
  "dismiss_suggestion" | "start_cruise" | "start_new_blast";
type LifecycleTransitionPayload = {
  action: LifecycleTransitionAction;
  blast_id: string;
  phase: "blast" | "cruise";
};
export type OfflineOperationInput =
  | { id: string; kind: "start_workout"; payload: StartWorkoutPayload }
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
  | {
      id: string;
      kind: "save_rotation_assignment";
      payload: RotationAssignmentPayload;
    }
  | {
      id: string;
      kind: "correct_history_performance";
      payload: PerformanceSnapshot &
        StepTarget & {
          expected_performance: PerformanceSnapshot;
        };
    }
  | {
      id: string;
      kind: "transition_training_lifecycle";
      payload: LifecycleTransitionPayload;
    }
  | { id: string; kind: "set_weight_unit"; payload: { unit: WeightUnit } };

export type OfflineOperation = OfflineOperationInput & {
  createdAt: number;
  sequence: number;
  userId: string;
};

export type OfflineAccountState = {
  activeWorkoutStartOperationId: string | null;
  assignments: Record<string, Assignment>;
  history: HistoryData | null;
  logbookStates: Record<string, AssignmentLogbookState>;
  queueSequence: number;
  recentOperation: {
    id: string;
    status: "baseline" | "completed" | "skipped" | "win";
  } | null;
  recentlyCompletedWorkout: Workout | null;
  updatedAt: string;
  userId: string;
  weightUnit: WeightUnit;
  workout: LoadedWorkout | null;
};

export type EditingDeviceAccess = "active" | "checking" | "readonly";

type EditingDeviceStatus = {
  active: boolean;
  device_id: string;
  transferred_at: string;
};

const databaseName = "dc-training-offline";
const stateStore = "accounts";
const operationStore = "operations";
const deviceIdStorageKey = "dc-training-editing-device";
const memoryStates = new Map<string, OfflineAccountState>();
const memoryOperations = new Map<string, OfflineOperation>();
let memoryWrite = Promise.resolve();
let databasePromise: Promise<IDBDatabase> | null = null;
let memoryDeviceId = "";
let memoryDeviceIdDurable = false;

export function isCloudOwnerId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function editingDeviceId() {
  try {
    if (typeof localStorage === "undefined") return fallbackEditingDeviceId();
    const stored = localStorage.getItem(deviceIdStorageKey) ?? "";
    if (validUuid(stored)) {
      memoryDeviceId = stored;
      memoryDeviceIdDurable = true;
      return stored;
    }
    memoryDeviceId = fallbackEditingDeviceId();
    localStorage.setItem(deviceIdStorageKey, memoryDeviceId);
    memoryDeviceIdDurable = true;
    return memoryDeviceId;
  } catch {
    return fallbackEditingDeviceId();
  }
}

export function hasDurableEditingDeviceId() {
  return memoryDeviceIdDurable;
}

function fallbackEditingDeviceId() {
  if (!validUuid(memoryDeviceId)) memoryDeviceId = crypto.randomUUID();
  memoryDeviceIdDurable = false;
  try {
    if (typeof document === "undefined") return memoryDeviceId;
    const stored = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${deviceIdStorageKey}=`))
      ?.slice(deviceIdStorageKey.length + 1);
    if (stored && validUuid(stored)) memoryDeviceId = stored;
    else
      document.cookie = `${deviceIdStorageKey}=${memoryDeviceId}; Max-Age=315360000; Path=/; SameSite=Lax`;
    memoryDeviceIdDurable = document.cookie
      .split(";")
      .some(
        (item) => item.trim() === `${deviceIdStorageKey}=${memoryDeviceId}`,
      );
  } catch {
    // A volatile ID may view data, but transfer will preserve its queued work.
  }
  return memoryDeviceId;
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function registerEditingDevice(deviceId: string) {
  return editingDeviceAccess("register_editing_device", deviceId);
}

export async function transferEditingDevice(deviceId: string) {
  return editingDeviceAccess("transfer_editing_device", deviceId);
}

async function editingDeviceAccess(
  rpc: "register_editing_device" | "transfer_editing_device",
  deviceId: string,
) {
  if (!supabase) throw new Error("CLOUD IS NOT CONFIGURED");
  if (!validUuid(deviceId)) throw new Error("DEVICE ID IS INVALID");
  const { data, error } = await supabase.rpc(rpc, { p_device_id: deviceId });
  if (error) throw new Error(error.message);
  if (!validEditingDeviceStatus(data))
    throw new Error("DEVICE ACCESS COULD NOT BE VERIFIED");
  return data.active ? ("active" as const) : ("readonly" as const);
}

function validEditingDeviceStatus(
  value: unknown,
): value is EditingDeviceStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<EditingDeviceStatus>;
  return (
    typeof status.active === "boolean" &&
    typeof status.device_id === "string" &&
    validUuid(status.device_id) &&
    typeof status.transferred_at === "string"
  );
}

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
    logbookStates: {},
    queueSequence: 0,
    recentOperation: null,
    recentlyCompletedWorkout: null,
    updatedAt: new Date(0).toISOString(),
    userId,
    weightUnit: "lb",
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
    OfflineOperation | undefined;
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
  memoryWrite = work.then(
    () => undefined,
    () => undefined,
  );
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

export async function discardOfflineOperations(userId: string) {
  for (const operation of await listOfflineOperations(userId))
    await deleteOfflineOperation(operation.id);
}

export async function deleteLocalAccountData(userId: string) {
  memoryStates.delete(userId);
  for (const [operationId, operation] of memoryOperations)
    if (operation.userId === userId) memoryOperations.delete(operationId);

  try {
    if (typeof indexedDB !== "undefined") {
      const database = databasePromise ? await databasePromise : null;
      database?.close();
      await new Promise<void>((resolve, reject) => {
        const deleting = indexedDB.deleteDatabase(databaseName);
        deleting.onerror = () => reject(deleting.error);
        deleting.onblocked = () => resolve();
        deleting.onsuccess = () => resolve();
      });
    }
  } finally {
    databasePromise = null;
    try {
      localStorage.removeItem(deviceIdStorageKey);
      localStorage.removeItem(`dc-training-editing-access:${userId}`);
    } catch {
      // IndexedDB and in-memory owner data are already gone.
    }
    try {
      document.cookie = `${deviceIdStorageKey}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = `dc-training-editing-access-${userId}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch {
      // Cookie storage may be unavailable.
    }
    memoryDeviceId = "";
    memoryDeviceIdDurable = false;
  }
}

async function editingDeviceAuthority(
  userId: string,
  deviceId: string,
  access?: Exclude<EditingDeviceAccess, "checking">,
) {
  if (access) return access;
  if (!isCloudOwnerId(userId)) return "active";
  return registerEditingDevice(deviceId);
}

export async function synchronizeOfflineState(
  userId: string,
  deviceId = editingDeviceId(),
  access?: Exclude<EditingDeviceAccess, "checking">,
) {
  if (!supabase) throw new Error("CLOUD IS NOT CONFIGURED");
  const deviceAccess = await editingDeviceAuthority(userId, deviceId, access);
  for (;;) {
    const operations = await listOfflineOperations(userId);
    if (deviceAccess === "readonly" && operations.length > 0)
      throw new Error("READ ONLY · UNSYNCED CHANGES REMAIN ON THIS DEVICE");
    for (const operation of operations) {
      await replayOfflineOperation(operation, userId, deviceId);
      await deleteOfflineOperation(operation.id);
    }
    const cloud = await loadCloudState(userId);
    if (await replaceStateWhenQueueEmpty(cloud)) {
      emitOfflineState(userId);
      return deviceAccess;
    }
  }
}

async function replayOfflineOperation(
  operation: OfflineOperation,
  userId: string,
  deviceId: string,
) {
  if (operation.kind === "set_weight_unit") {
    if (!isCloudOwnerId(userId)) return;
    const { error } = await supabase!.rpc("save_weight_unit", {
      p_device_id: deviceId,
      p_unit: operation.payload.unit,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase!.rpc("apply_offline_operation", {
    ...(isCloudOwnerId(userId) ? { p_device_id: deviceId } : {}),
    p_kind: operation.kind,
    p_operation_id: operation.id,
    p_payload: {
      ...operation.payload,
      created_at: new Date(operation.createdAt).toISOString(),
    },
  });
  if (error) throw new Error(error.message);
}

async function loadCloudState(userId: string): Promise<OfflineAccountState> {
  const [workout, history, assignments, logbookStates, weightUnit] =
    await Promise.all([
      loadWorkoutState(userId),
      loadHistoryState(userId),
      loadCloudAssignments(userId),
      loadCloudLogbookStates(userId),
      loadCloudWeightUnit(userId),
    ]);
  if (
    !workout.data ||
    !history.data ||
    !assignments ||
    !logbookStates ||
    !weightUnit
  )
    throw new Error(
      workout.error || history.error || "OWNER DATA COULD NOT BE LOADED",
    );
  return {
    ...emptyState(userId),
    assignments,
    history: history.data,
    logbookStates,
    updatedAt: new Date().toISOString(),
    weightUnit,
    workout: workout.data,
  };
}

async function loadCloudWeightUnit(userId: string): Promise<WeightUnit | null> {
  if (!isCloudOwnerId(userId)) return "lb";
  const { data, error } = await supabase!
    .from("foundation_profiles")
    .select("weight_unit")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && (data?.weight_unit === "lb" || data?.weight_unit === "kg")
    ? data.weight_unit
    : null;
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

async function loadCloudLogbookStates(userId: string) {
  const { data, error } = await supabase!
    .from("assignment_logbook_states")
    .select("assignment_id,state")
    .eq("user_id", userId);
  if (error || !Array.isArray(data) || data.some(invalidLogbookState))
    return null;
  return Object.fromEntries(
    data.map((row) => [row.assignment_id, row.state as AssignmentLogbookState]),
  );
}

function invalidLogbookState(row: Record<string, unknown>) {
  return (
    typeof row.assignment_id !== "string" ||
    ![
      "first_failure_pending",
      "mulligan_used",
      "replacement_required",
    ].includes(row.state as string)
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
    OfflineAccountState | undefined;
  states.put(preserveLocalFeedback(state, current));
  await transactionDone(transaction);
  return true;
}

function preserveLocalFeedback(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  cloud = preserveActiveWorkoutStepIds(cloud, local);
  const feedback = preservedUndoFeedback(cloud, local);
  return {
    ...cloud,
    activeWorkoutStartOperationId: preservedStartOperation(cloud, local),
    queueSequence: local?.queueSequence ?? 0,
    ...feedback,
  };
}

export function preservedUndoFeedback(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  const empty = { recentOperation: null, recentlyCompletedWorkout: null };
  const context = undoFeedbackContext(cloud, local);
  if (!context || !feedbackInCurrentBlast(cloud, context.workout)) return empty;
  if (context.workout.status === "completed") {
    const recentlyCompletedWorkout = local?.recentlyCompletedWorkout;
    if (
      !recentlyCompletedWorkout ||
      !canPreserveCompletedUndo(
        cloud,
        context.workout,
        recentlyCompletedWorkout,
      )
    )
      return empty;
    return {
      recentOperation: context.recentOperation,
      recentlyCompletedWorkout,
    };
  }
  if (!canPreserveActiveUndo(cloud, context.workout, context.step))
    return empty;
  return {
    recentOperation: context.recentOperation,
    recentlyCompletedWorkout: null,
  };
}

function undoFeedbackContext(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  const recentOperation = local?.recentOperation;
  if (!recentOperation || !cloud.history || !cloud.workout) return null;
  const step = cloud.history.steps.find(
    (item) => item.last_operation_id === recentOperation.id,
  );
  if (!step) return null;
  const workout = cloud.history.workouts.find(
    (item) => item.workout_id === step.workout_id,
  );
  return workout ? { recentOperation, step, workout } : null;
}

function feedbackInCurrentBlast(
  cloud: OfflineAccountState,
  workout: HistoryWorkout,
) {
  const lifecycle = cloud.workout!.lifecycle;
  return lifecycle.phase === "blast" && workout.blast_id === lifecycle.blast_id;
}

function canPreserveCompletedUndo(
  cloud: OfflineAccountState,
  workout: HistoryWorkout,
  recentlyCompletedWorkout: Workout,
) {
  return (
    recentlyCompletedWorkout.workout_id === workout.workout_id &&
    !cloud.workout!.workout &&
    cloud.workout!.lastCompletedSlot === workout.slot &&
    cloud.workout!.nextSlot === nextSlot(workout.slot) &&
    !cloud.history!.workouts.some(
      (item) =>
        item.status === "completed" &&
        progressionOrder(item) > progressionOrder(workout),
    )
  );
}

function canPreserveActiveUndo(
  cloud: OfflineAccountState,
  workout: HistoryWorkout,
  step: WorkoutStep,
) {
  return (
    cloud.workout!.workout?.workout_id === workout.workout_id &&
    !cloud.history!.steps.some(
      (item) =>
        item.workout_id === workout.workout_id &&
        item.ordinal > step.ordinal &&
        item.status !== "pending",
    )
  );
}

function preserveActiveWorkoutStepIds(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  const cloudWorkout = activeWorkout(cloud);
  const localWorkout = activeWorkout(local);
  if (!cloudWorkout) return cloud;
  if (!localWorkout) return cloud;
  if (cloudWorkout.slot !== localWorkout.slot) return cloud;
  const localStartOperationId = local!.activeWorkoutStartOperationId;
  if (!localStartOperationId) return cloud;
  if (
    startOperationForWorkout(cloud, cloudWorkout.workout_id) !==
    localStartOperationId
  )
    return cloud;
  const localSteps = new Map(
    local!.workout!.steps.map((step) => [step.ordinal, step]),
  );
  const stepIds = new Map<number, string>();
  const steps = cloud.workout!.steps.map((step) =>
    preserveWorkoutStepId(step, localSteps, stepIds),
  );
  return {
    ...cloud,
    history: preserveHistoryStepIds(
      cloud.history,
      cloudWorkout.workout_id,
      stepIds,
    ),
    workout: { ...cloud.workout!, steps },
  };
}

function activeWorkout(state: OfflineAccountState | undefined) {
  return state?.workout?.workout ?? null;
}

function startOperationForWorkout(
  state: OfflineAccountState,
  workoutId: string,
) {
  if (!state.history) return null;
  return (
    state.history.workouts.find((workout) => workout.workout_id === workoutId)
      ?.start_operation_id ?? null
  );
}

function preserveWorkoutStepId(
  step: WorkoutStep,
  localSteps: Map<number, WorkoutStep>,
  stepIds: Map<number, string>,
) {
  const localStep = localSteps.get(step.ordinal);
  if (!localStep) return step;
  if (localStep.body_part !== step.body_part) return step;
  if (localStep.kind !== step.kind) return step;
  stepIds.set(step.ordinal, localStep.step_id);
  return { ...step, step_id: localStep.step_id };
}

function preserveHistoryStepIds(
  history: HistoryData | null,
  workoutId: string,
  stepIds: Map<number, string>,
) {
  if (!history) return null;
  return {
    ...history,
    steps: history.steps.map((step) => {
      if (step.workout_id !== workoutId) return step;
      const stepId = stepIds.get(step.ordinal);
      return stepId ? { ...step, step_id: stepId } : step;
    }),
  };
}

function preservedStartOperation(
  cloud: OfflineAccountState,
  local: OfflineAccountState | undefined,
) {
  const cloudWorkoutId = cloud.workout?.workout?.workout_id;
  const localOperationId = local?.activeWorkoutStartOperationId;
  if (!cloudWorkoutId || !localOperationId) return null;
  return cloud.history?.workouts.find(
    (workout) => workout.workout_id === cloudWorkoutId,
  )?.start_operation_id === localOperationId
    ? localOperationId
    : null;
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
      OfflineAccountState | undefined;
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
    localStartOperation(step.workout_id) ??
    startOperationForWorkout(state, step.workout_id) ??
    state.activeWorkoutStartOperationId;
  if (!workoutOperationId)
    throw new Error("LOCAL WORKOUT OPERATION IS MISSING");
  return {
    ordinal: step.ordinal,
    workout_operation_id: workoutOperationId,
  };
}

export function startWorkoutPayload(
  state: OfflineAccountState,
): StartWorkoutPayload {
  if (!state.workout || !state.history)
    throw new Error("OWNER DATA IS NOT AVAILABLE ON THIS DEVICE");
  const blastId = state.workout.lifecycle.blast_id;
  if (state.workout.lifecycle.phase !== "blast" || !blastId)
    throw new Error("WORKOUTS REQUIRE AN ACTIVE BLAST");
  const slot = state.workout.nextSlot;
  const assignments = Object.fromEntries(
    positionsFor(slot).map((position) => {
      const assignment = state.assignments[assignmentKey(slot, position)];
      if (!assignment) throw new Error(`${slot} REQUIRES SAVED ASSIGNMENTS`);
      return [position, assignment.assignment_id];
    }),
  );
  const previousWorkout = [...state.history.workouts]
    .filter((workout) => workout.status === "completed")
    .sort((left, right) => progressionOrder(right) - progressionOrder(left))[0];
  return {
    assignments,
    blast_id: blastId,
    previous_workout_operation_id: previousWorkout?.start_operation_id ?? null,
    slot,
  };
}

export function lifecycleTransitionPayload(
  state: OfflineAccountState,
  action: LifecycleTransitionAction,
): LifecycleTransitionPayload {
  const lifecycle = state.workout?.lifecycle;
  if (!lifecycle?.blast_id)
    throw new Error("TRAINING PHASE IS NOT AVAILABLE ON THIS DEVICE");
  return {
    action,
    blast_id: lifecycle.blast_id,
    phase: lifecycle.phase,
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
    case "set_weight_unit":
      state.weightUnit = operation.payload.unit;
      return state;
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
  if (state.workout.workout) throw new Error("WORKOUT IS ALREADY IN PROGRESS");
  if (hasPendingLogbookDecision(state))
    throw new Error("RESOLVE THE LOGBOOK DECISION FIRST");
  const intended = startWorkoutPayload(state);
  assertStartContext(operation.payload, intended);
  const slot = intended.slot;
  const assignments = positionsFor(slot).map(
    (position) => state.assignments[assignmentKey(slot, position)],
  );
  if (assignments.some((assignment) => !assignment))
    throw new Error(`${slot} REQUIRES SAVED ASSIGNMENTS`);
  const startedAt = new Date(operation.createdAt).toISOString();
  const workout: HistoryWorkout = {
    blast_id: intended.blast_id,
    completed_at: null,
    progression_order: nextLocalProgressionOrder(state),
    slot,
    start_operation_id: operation.id,
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

function nextLocalProgressionOrder(state: OfflineAccountState) {
  return Math.max(0, ...state.history!.workouts.map(progressionOrder)) + 1;
}

function assertStartContext(
  queued: StartWorkoutPayload,
  current: StartWorkoutPayload,
) {
  if (
    queued.slot !== current.slot ||
    queued.blast_id !== current.blast_id ||
    queued.previous_workout_operation_id !==
      current.previous_workout_operation_id ||
    JSON.stringify(queued.assignments) !== JSON.stringify(current.assignments)
  )
    throw new Error("OFFLINE START CONTEXT CHANGED");
}

function hasPendingLogbookDecision(state: OfflineAccountState) {
  return Object.values(state.logbookStates).some(
    (value) => value !== "mulligan_used",
  );
}

const stepOrder: Record<"A" | "B", [string, "exercise" | "stretch", number][]> =
  {
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
  return {
    ...localAssignmentFields(state, assignment),
    body_part: bodyPart,
    duration_seconds: null,
    enforcement_action: null,
    kind,
    last_operation_id: null,
    ordinal,
    reps: [],
    resolution: null,
    set_verdicts: [],
    status: "pending",
    step_id: `local:${operationId}:${ordinal}`,
    weight_entries: [],
    workout_id: workout.workout_id,
    verdict: null,
  };
}

type LocalAssignmentFields = Pick<
  WorkoutStep,
  | "assignment_id"
  | "exercise"
  | "fresh_baseline"
  | "mulligan_used"
  | "previous_duration_seconds"
  | "previous_reps"
  | "previous_weight_entries"
  | "protocol"
  | "reference_history"
  | "structure"
  | "target_sets"
>;

function localAssignmentFields(
  state: OfflineAccountState,
  assignment: Assignment | null,
): LocalAssignmentFields {
  if (!assignment) {
    return {
      assignment_id: null,
      exercise: null,
      fresh_baseline: false,
      mulligan_used: false,
      previous_duration_seconds: null,
      previous_reps: [],
      previous_weight_entries: [],
      protocol: null,
      reference_history: [],
      structure: null,
      target_sets: [],
    };
  }
  const previous = previousPerformance(state, assignment);
  return {
    assignment_id: assignment.assignment_id,
    exercise: assignment.exercise,
    fresh_baseline: previous.currentBlast === null,
    mulligan_used:
      state.logbookStates[assignment.assignment_id] === "mulligan_used",
    ...localPreviousFields(previous.currentBlast),
    protocol: assignment.protocol,
    reference_history: previous.reference,
    structure: assignment.structure,
    target_sets: assignment.target_sets,
  };
}

function localPreviousFields(
  previous: HistoryData["steps"][number] | null,
): Pick<
  LocalAssignmentFields,
  "previous_duration_seconds" | "previous_reps" | "previous_weight_entries"
> {
  if (!previous) {
    return {
      previous_duration_seconds: null,
      previous_reps: [],
      previous_weight_entries: [],
    };
  }
  return {
    previous_duration_seconds: previous.duration_seconds,
    previous_reps: previous.reps,
    previous_weight_entries: previous.weight_entries,
  };
}

function previousPerformance(
  state: OfflineAccountState,
  assignment: Assignment,
) {
  const history = state.history!;
  const workouts = new Map(
    history.workouts.map((item) => [item.workout_id, item]),
  );
  const completed = history.steps
    .filter(
      (step) =>
        step.assignment_id === assignment.assignment_id &&
        step.status === "completed",
    )
    .sort(
      (left, right) =>
        progressionOrder(workouts.get(left.workout_id)!) -
          progressionOrder(workouts.get(right.workout_id)!) ||
        left.ordinal - right.ordinal,
    );
  const currentBlastId = state.workout!.lifecycle.blast_id;
  const currentBlast =
    completed
      .filter(
        (step) => workouts.get(step.workout_id)?.blast_id === currentBlastId,
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
  const index = targetStepIndex(state, state.workout.steps, operation.payload);
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
  applyLocalStepLogbookState(state, next);
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

function applyLocalStepLogbookState(
  state: OfflineAccountState,
  step: WorkoutStep,
) {
  if (!step.assignment_id || step.status !== "completed") return;
  if (step.verdict === "win" || step.fresh_baseline) {
    delete state.logbookStates[step.assignment_id];
    return;
  }
  if (step.enforcement_action === "first_failure")
    state.logbookStates[step.assignment_id] = "first_failure_pending";
  if (step.enforcement_action === "replacement_required")
    state.logbookStates[step.assignment_id] = "replacement_required";
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
  recalculateLocalCruiseSuggestion(state);
  return state;
}

function resolveLocalLogbook(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "resolve_logbook_action" }>,
) {
  if (!state.workout?.workout || !state.history)
    throw new Error("WORKOUT IS NOT IN PROGRESS");
  const index = targetStepIndex(state, state.workout.steps, operation.payload);
  const step = state.workout.steps[index];
  if (!step?.enforcement_action)
    throw new Error("LOGBOOK DECISION IS NOT PENDING");
  applyLocalLogbookAction(step, operation.payload.action);
  applyResolvedLogbookState(state, step, operation.payload.action);
  step.resolution = operation.payload.action;
  step.last_operation_id = step.enforcement_action
    ? step.last_operation_id
    : null;
  if (step.enforcement_action === null) state.recentOperation = null;
  replaceHistoryStep(state.history, step);
  return finishLocalWorkout(state, operation.createdAt);
}

function applyLocalLogbookAction(
  step: WorkoutStep,
  action: "count_failure" | "count_win" | "use_mulligan",
) {
  if (action === "count_failure") {
    step.verdict = "failure";
    step.enforcement_action = step.mulligan_used
      ? "replacement_required"
      : "first_failure";
    return;
  }
  step.enforcement_action = null;
  if (action === "count_win") step.verdict = "win";
  else step.mulligan_used = true;
}

function applyResolvedLogbookState(
  state: OfflineAccountState,
  step: WorkoutStep,
  action: "count_failure" | "count_win" | "use_mulligan",
) {
  if (!step.assignment_id) return;
  if (action === "count_win") {
    delete state.logbookStates[step.assignment_id];
    return;
  }
  if (action === "use_mulligan") {
    state.logbookStates[step.assignment_id] = "mulligan_used";
    return;
  }
  state.logbookStates[step.assignment_id] = step.mulligan_used
    ? "replacement_required"
    : "first_failure_pending";
}

function replaceLocalAssignment(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "replace_failed_assignment" }>,
) {
  if (!state.workout?.workout || !state.history)
    throw new Error("WORKOUT IS NOT IN PROGRESS");
  const index = targetStepIndex(state, state.workout.steps, operation.payload);
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
  assertAssignmentContext(current, operation.payload.expected_assignment_id);
  if (current && state.logbookStates[current.assignment_id])
    throw new Error("RESOLVE THE ACTIVE LOGBOOK LIFECYCLE FIRST");
  if (sameAssignment(current, operation.payload)) return state;
  if (assignmentInWorkout(state.workout, current))
    throw new Error(
      "FINISH THE ACTIVE WORKOUT BEFORE CHANGING THIS ASSIGNMENT",
    );
  saveAssignmentRecord(state, operation, current?.assignment_id ?? null);
  return state;
}

function assertAssignmentContext(
  current: Assignment | undefined,
  expectedAssignmentId: string | null,
) {
  if ((current?.assignment_id ?? null) !== expectedAssignmentId)
    throw new Error("OFFLINE ASSIGNMENT CONTEXT CHANGED");
}

function sameAssignment(
  current: Assignment | undefined,
  payload: AssignmentPayload,
) {
  if (!current) return false;
  return (
    current.exercise === payload.exercise &&
    current.protocol === payload.protocol &&
    current.structure === payload.structure &&
    JSON.stringify(current.target_sets) === JSON.stringify(payload.target_sets)
  );
}

function assignmentInWorkout(
  workout: LoadedWorkout,
  assignment: Assignment | undefined,
) {
  if (!assignment) return false;
  return workout.steps.some(
    (step) => step.assignment_id === assignment.assignment_id,
  );
}

function saveAssignmentRecord(
  state: OfflineAccountState,
  operation: Extract<
    OfflineOperation,
    { kind: "replace_failed_assignment" | "save_rotation_assignment" }
  >,
  replacedAssignmentId: string | null,
) {
  const key = assignmentKey(
    operation.payload.slot,
    operation.payload.body_part,
  );
  const current = state.assignments[key];
  if (current) {
    delete state.logbookStates[current.assignment_id];
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
  if (!state.history)
    throw new Error("HISTORY IS NOT AVAILABLE ON THIS DEVICE");
  const index = targetStepIndex(state, state.history.steps, operation.payload);
  const step = state.history.steps[index];
  if (!step || step.kind !== "exercise" || step.status !== "completed")
    throw new Error("COMPLETED PERFORMANCE WAS NOT FOUND");
  if (
    state.workout?.workout &&
    state.workout.steps.some(
      (activeStep) => activeStep.assignment_id === step.assignment_id,
    )
  )
    throw new Error("FINISH ACTIVE WORKOUT BEFORE CORRECTING THIS EXERCISE");
  assertPerformanceContext(step, operation.payload.expected_performance);
  step.weight_entries = operation.payload.weights.map(normalizeWeight);
  step.reps = operation.payload.reps;
  step.duration_seconds = operation.payload.duration_seconds;
  step.resolution = step.resolution === "replaced" ? "replaced" : null;
  step.last_operation_id = null;
  recalculateLocalAssignmentLogbook(state, step.assignment_id!);
  return state;
}

function assertPerformanceContext(
  step: WorkoutStep,
  expected: PerformanceSnapshot,
) {
  if (
    step.duration_seconds !== expected.duration_seconds ||
    JSON.stringify(step.reps) !== JSON.stringify(expected.reps) ||
    JSON.stringify(step.weight_entries) !== JSON.stringify(expected.weights)
  )
    throw new Error("OFFLINE PERFORMANCE CONTEXT CHANGED");
}

type RecalculationCursor = {
  deferred: boolean;
  first: boolean;
  logbook: AssignmentLogbookState | null;
  previous: WorkoutStep | null;
};

function recalculateLocalAssignmentLogbook(
  state: OfflineAccountState,
  assignmentId: string,
) {
  const history = state.history!;
  const active =
    history.assignments.find((item) => item.assignment_id === assignmentId)
      ?.active ?? false;
  const workouts = new Map(
    history.workouts.map((item) => [item.workout_id, item]),
  );
  const steps = history.steps
    .filter(
      (step) =>
        step.assignment_id === assignmentId && step.status === "completed",
    )
    .sort(
      (left, right) =>
        progressionOrder(workouts.get(left.workout_id)!) -
          progressionOrder(workouts.get(right.workout_id)!) ||
        left.ordinal - right.ordinal,
    );
  let cursor: RecalculationCursor = {
    deferred: false,
    first: true,
    logbook: null,
    previous: null,
  };
  const activeBlastId = active ? state.workout?.lifecycle.blast_id : null;
  let lastBlastId: string | null = null;
  delete state.logbookStates[assignmentId];
  for (const step of steps) {
    const blastId = workouts.get(step.workout_id)!.blast_id;
    if (blastId !== lastBlastId) {
      cursor = {
        deferred: false,
        first: true,
        logbook: null,
        previous: null,
      };
      lastBlastId = blastId;
    }
    const activeLifecycle = blastId === activeBlastId;
    const result = recalculateLocalStep(step, cursor, activeLifecycle);
    cursor = result.cursor;
    replaceHistoryStep(history, result.step);
    replaceActiveStep(state, result.step);
  }
  if (lastBlastId === activeBlastId && cursor.logbook)
    state.logbookStates[assignmentId] = cursor.logbook;
}

function recalculateLocalStep(
  step: WorkoutStep,
  cursor: RecalculationCursor,
  active: boolean,
) {
  const next = { ...step };
  const resolutionBefore = next.resolution;
  const stateBefore = cursor.logbook;
  next.mulligan_used = cursor.logbook === "mulligan_used";
  next.enforcement_action = null;
  next.set_verdicts = [];
  let logbook = cursor.first
    ? resetLocalBaseline(next)
    : evaluateRecalculatedPerformance(next, cursor.previous!, cursor.logbook);
  if (cursor.deferred) {
    logbook = stateBefore;
    next.enforcement_action = null;
    next.resolution = resolutionBefore;
  }
  if (!active) {
    logbook = null;
    next.enforcement_action = null;
  }
  return {
    cursor: {
      deferred: cursor.deferred || (active && next.enforcement_action !== null),
      first: false,
      logbook,
      previous: next,
    },
    step: next,
  };
}

function resetLocalBaseline(step: WorkoutStep) {
  step.fresh_baseline = true;
  step.previous_duration_seconds = null;
  step.previous_reps = [];
  step.previous_weight_entries = [];
  step.verdict = null;
  step.resolution = null;
  return null;
}

function evaluateRecalculatedPerformance(
  step: WorkoutStep,
  previous: WorkoutStep,
  logbook: AssignmentLogbookState | null,
) {
  step.fresh_baseline = false;
  step.previous_weight_entries = previous.weight_entries;
  step.previous_reps = previous.reps;
  step.previous_duration_seconds = previous.duration_seconds;
  const comparison = compareLogbookPerformance({
    bodyPart: step.body_part,
    current: {
      durationSeconds: step.duration_seconds,
      reps: step.reps,
      weights: step.weight_entries,
    },
    previous: {
      durationSeconds: previous.duration_seconds,
      reps: previous.reps,
      weights: previous.weight_entries,
    },
    protocol: step.protocol!,
    targetSets: step.target_sets,
  });
  step.set_verdicts = comparison.setVerdicts;
  const verdict = resolvedRecalculatedVerdict(
    comparison.verdict,
    step.resolution,
  );
  if (verdict === "ambiguous") {
    step.verdict = null;
    step.enforcement_action = "abs_choice";
    return logbook;
  }
  if (verdict === "win") {
    step.verdict = "win";
    if (step.resolution !== "replaced" && comparison.verdict !== "ambiguous")
      step.resolution = null;
    return null;
  }
  if (verdict === "baseline") {
    step.verdict = null;
    return null;
  }
  return applyRecalculatedFailure(step, logbook);
}

function resolvedRecalculatedVerdict(
  verdict: "ambiguous" | "baseline" | "failure" | "win",
  resolution: WorkoutStep["resolution"],
) {
  if (verdict !== "ambiguous") return verdict;
  if (resolution === "count_win") return "win" as const;
  if (["count_failure", "use_mulligan", "replaced"].includes(resolution ?? ""))
    return "failure" as const;
  return "ambiguous" as const;
}

function applyRecalculatedFailure(
  step: WorkoutStep,
  logbook: AssignmentLogbookState | null,
): AssignmentLogbookState | null {
  step.verdict = "failure";
  if (step.resolution === "count_win") step.resolution = null;
  if (step.resolution === "replaced") {
    step.enforcement_action = null;
    return null;
  }
  if (logbook) {
    step.enforcement_action = "replacement_required";
    return "replacement_required";
  }
  if (step.resolution === "use_mulligan") return "mulligan_used";
  step.enforcement_action = "first_failure";
  return "first_failure_pending";
}

function replaceActiveStep(state: OfflineAccountState, step: WorkoutStep) {
  const index = state.workout?.steps.findIndex(
    (item) => item.step_id === step.step_id,
  );
  if (index !== undefined && index >= 0) state.workout!.steps[index] = step;
}

function transitionLocalLifecycle(
  state: OfflineAccountState,
  operation: Extract<
    OfflineOperation,
    { kind: "transition_training_lifecycle" }
  >,
) {
  if (!state.workout)
    throw new Error("TRAINING PHASE IS NOT AVAILABLE ON THIS DEVICE");
  const action = operation.payload.action;
  const current = state.workout.lifecycle;
  assertLocalLifecycleContext(current, operation.payload);
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
    resetLocalLogbookForNewBlast(state);
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

function assertLocalLifecycleContext(
  current: TrainingLifecycle,
  payload: LifecycleTransitionPayload,
) {
  if (current.phase !== payload.phase || current.blast_id !== payload.blast_id)
    throw new Error("OFFLINE LIFECYCLE CONTEXT CHANGED");
}

function resetLocalLogbookForNewBlast(state: OfflineAccountState) {
  state.logbookStates = {};
  for (const step of state.history?.steps ?? []) step.enforcement_action = null;
}

function undoLocalStep(
  state: OfflineAccountState,
  operation: Extract<OfflineOperation, { kind: "undo_workout_step" }>,
) {
  if (!state.history || !state.workout)
    throw new Error("WORKOUT DATA IS NOT AVAILABLE ON THIS DEVICE");
  const step = state.history.steps.find(
    (item) =>
      item.last_operation_id === operation.payload.original_operation_id,
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
  if (step.assignment_id)
    recalculateLocalAssignmentLogbook(state, step.assignment_id);
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
  state.workout.lastCompletedSlot = latestCompletedSlot(
    state.history,
    step.workout_id,
  );
  state.activeWorkoutStartOperationId =
    localStartOperation(historyWorkout.workout_id) ??
    historyWorkout.start_operation_id;
  state.recentOperation = null;
  state.recentlyCompletedWorkout = null;
  recalculateLocalCruiseSuggestion(state);
  return state;
}

function recalculateLocalCruiseSuggestion(state: OfflineAccountState) {
  const lifecycle = state.workout?.lifecycle;
  if (!lifecycle || !state.history) return;
  const threshold =
    Date.parse(lifecycle.blast_started_at ?? "") + 49 * 86_400_000;
  lifecycle.suggestion_due =
    lifecycle.phase === "blast" &&
    lifecycle.suggestion_dismissed === false &&
    Number.isFinite(threshold) &&
    state.history.workouts.some(
      (workout) =>
        workout.blast_id === lifecycle.blast_id &&
        workout.status === "completed" &&
        Date.parse(workout.completed_at ?? "") >= threshold,
    );
}

function targetStepIndex(
  state: OfflineAccountState,
  steps: WorkoutStep[],
  target: StepTarget,
) {
  if (target.step_id)
    return steps.findIndex((step) => step.step_id === target.step_id);
  return steps.findIndex(
    (step) =>
      step.ordinal === target.ordinal &&
      stepMatchesWorkoutOperation(
        state,
        step.workout_id,
        target.workout_operation_id,
      ),
  );
}

function stepMatchesWorkoutOperation(
  state: OfflineAccountState,
  workoutId: string,
  operationId: string | undefined,
) {
  const localOperationId = localStartOperation(workoutId);
  if (localOperationId) return localOperationId === operationId;
  return (
    startOperationForWorkout(state, workoutId) === operationId ||
    (state.activeWorkoutStartOperationId === operationId &&
      state.workout?.workout?.workout_id === workoutId)
  );
}

function replaceHistoryStep(history: HistoryData, step: WorkoutStep) {
  const index = history.steps.findIndex(
    (item) => item.step_id === step.step_id,
  );
  if (index >= 0) history.steps[index] = step;
}

function latestCompletedSlot(history: HistoryData, excludedWorkoutId: string) {
  return (
    history.workouts
      .filter(
        (item) =>
          item.workout_id !== excludedWorkoutId && item.status === "completed",
      )
      .sort(
        (left, right) => progressionOrder(right) - progressionOrder(left),
      )[0]?.slot ?? null
  );
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
