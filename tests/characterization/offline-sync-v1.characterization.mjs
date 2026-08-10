import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const offlineModule = "src/offline-sync.ts";
const syncHook = "src/hooks/use-offline-sync.ts";
const migration =
  "supabase/migrations/20260810192528_offline_operation_queue.sql";
const eventTimeMigration =
  "supabase/migrations/20260810211000_preserve_offline_event_time.sql";
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
  existsSync(path.join(target, syncHook)) &&
  existsSync(path.join(target, migration)) &&
  existsSync(path.join(target, eventTimeMigration)) &&
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
    'operations.index("userId")',
  ]) &&
  hasAll(read(syncHook), [
    'useState<OfflineSyncState>("syncing")',
    "if (!online) return;",
    "void synchronize();",
    'document.addEventListener("visibilitychange"',
    "retry: synchronize",
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
