import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const offlineModule = "src/offline-sync.ts";
const assignmentModule = "src/rotation-assignment.ts";
const syncHook = "src/hooks/use-offline-sync.ts";
const workoutHook = "src/hooks/use-workout.ts";
const historyScreen = "src/HistoryScreen.tsx";
const migration =
  "supabase/migrations/20260810192528_offline_operation_queue.sql";
const eventTimeMigration =
  "supabase/migrations/20260810211000_preserve_offline_event_time.sql";
const convergenceMigration =
  "supabase/migrations/20260810214500_validate_offline_replay_context.sql";
const lifecycleMigration =
  "supabase/migrations/20260810222500_validate_offline_lifecycle_context.sql";
const blastReferenceRepair =
  "supabase/migrations/20260810223500_fix_offline_blast_reference_resolution.sql";
const versionValidationMigration =
  "supabase/migrations/20260810234000_validate_offline_versions.sql";
const read = (relativePath) =>
  readFileSync(path.join(target, relativePath), "utf8");
const hasAll = (source, fragments) =>
  fragments.every((fragment) => source.includes(fragment));

const predecessorContract =
  !existsSync(path.join(target, offlineModule)) &&
  existsSync(
    path.join(
      target,
      "supabase/migrations/20260810182600_guard_rotation_assignment_during_cruise.sql",
    ),
  ) &&
  read("src/hooks/use-workout.ts").includes("saveWorkoutStep(");

const offlineContract =
  existsSync(path.join(target, offlineModule)) &&
  existsSync(path.join(target, assignmentModule)) &&
  existsSync(path.join(target, syncHook)) &&
  existsSync(path.join(target, workoutHook)) &&
  existsSync(path.join(target, historyScreen)) &&
  existsSync(path.join(target, migration)) &&
  existsSync(path.join(target, eventTimeMigration)) &&
  existsSync(path.join(target, convergenceMigration)) &&
  existsSync(path.join(target, lifecycleMigration)) &&
  existsSync(path.join(target, blastReferenceRepair)) &&
  existsSync(path.join(target, versionValidationMigration)) &&
  hasAll(read(offlineModule), [
    'const databaseName = "dc-training-offline"',
    "[stateStore, operationStore]",
    'kind: "start_workout"',
    'kind: "correct_history_performance"',
    'kind: "transition_training_lifecycle"',
    'supabase.rpc("apply_offline_operation"',
    "created_at: new Date(operation.createdAt).toISOString()",
    '.from("assignment_logbook_states")',
    "recalculateLocalAssignmentLogbook",
    "recalculateLocalCruiseSuggestion",
    "preserveActiveWorkoutStepIds",
    "lifecycleTransitionPayload",
    "startWorkoutPayload",
    "expected_assignment_id",
    "previous_workout_operation_id",
    "workouts.get(step.workout_id)?.blast_id === currentBlastId",
    "startOperationForWorkout(state, step.workout_id)",
    "historyWorkout.start_operation_id",
    'operations.index("userId")',
  ]) &&
  hasAll(read(assignmentModule), ["isAssignment", "sameTargets"]) &&
  hasAll(read(syncHook), [
    'useState<OfflineSyncState>("syncing")',
    "const syncRequested = useRef(false)",
    "if (!online) return;",
    "void synchronize();",
    "} while (syncRequested.current);",
    'document.addEventListener("visibilitychange"',
    "retry: synchronize",
  ]) &&
  hasAll(read(workoutHook), [
    "const payload = startWorkoutPayload(state)",
    'error instanceof Error ? error.message : "WORKOUT COULD NOT START"',
  ]) &&
  hasAll(read(historyScreen), [
    "HistoryStepIdentity",
    "HistoryAssignmentIdentity",
    "historyAssignmentByIdentity",
    "historyStepByIdentity",
    "workout.start_operation_id",
  ]) &&
  hasAll(read("src/HomeScreen.tsx"), [
    "OFFLINE · SAVED ON DEVICE",
    "SYNC FAILED · SAVED ON DEVICE",
    "TRY AGAIN",
  ]) &&
  hasAll(read(migration), [
    "create table private.offline_operations",
    "create or replace function public.apply_offline_operation",
    "pg_advisory_xact_lock",
    "revoke execute on function public.apply_offline_operation",
    "grant execute on function public.apply_offline_operation",
  ]) &&
  hasAll(read(eventTimeMigration), [
    "private.offline_workout_result_at",
    "set started_at = event_at",
    "set completed_at = p_event_at",
    "set blast_ended_at = event_at",
    "set blast_started_at = event_at",
  ]) &&
  hasAll(read(convergenceMigration), [
    "private.assert_offline_start_context",
    "Offline start conflicts with an active workout",
    "Offline start assignments changed",
    "suggestion_due = not lifecycle.suggestion_dismissed and exists",
    "public.blast_has_elapsed_seven_weeks",
  ]) &&
  hasAll(read(lifecycleMigration), [
    "private.assert_offline_lifecycle_context",
    "private.resolve_offline_blast_reference",
    "Offline lifecycle context changed",
    "perform private.assert_offline_lifecycle_context(owner_id, p_payload)",
  ]) &&
  hasAll(read(blastReferenceRepair), [
    "private.resolve_offline_blast_reference",
    "reference_operation_id",
    "Offline lifecycle blast is not synchronized",
  ]) &&
  hasAll(read(versionValidationMigration), [
    "private.resolve_offline_assignment_reference",
    "private.assert_offline_assignment_context",
    "private.assert_offline_rotation_predecessor",
    "Offline assignment context changed",
    "Offline start rotation predecessor changed",
    "perform private.assert_offline_assignment_context(owner_id, p_payload)",
    "perform private.assert_offline_rotation_predecessor(owner_id, p_payload)",
  ]);

process.stdout.write(
  JSON.stringify({
    behavior: {
      offline_sync_surface_contract: predecessorContract || offlineContract,
    },
    scenario: "offline-sync-v1",
    schema_version: "1.0",
  }),
);
