import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const lifecycleMigration =
  "supabase/migrations/20260810163233_add_blast_cruise_lifecycle.sql";
const suggestionBackfill =
  "supabase/migrations/20260810174144_backfill_migrated_cruise_suggestions.sql";
const migrationExists = existsSync(path.join(target, lifecycleMigration));
const read = (relativePath) =>
  readFileSync(path.join(target, relativePath), "utf8");
const hasAll = (source, fragments) =>
  fragments.every((fragment) => source.includes(fragment));

const predecessorContract =
  !migrationExists &&
  existsSync(
    path.join(
      target,
      "supabase/migrations/20260810150000_guard_history_correction_during_active_workout.sql",
    ),
  ) &&
  !read("src/HomeScreen.tsx").includes("START NEW BLAST");

const lifecycleContract =
  migrationExists &&
  existsSync(path.join(target, suggestionBackfill)) &&
  hasAll(read(lifecycleMigration), [
    "create table public.training_lifecycle_state",
    "create or replace function public.transition_training_lifecycle",
    "new.blast_id := lifecycle.blast_id",
    "interval '7 weeks'",
    "enable row level security",
  ]) &&
  hasAll(read(suggestionBackfill), [
    "update public.training_lifecycle_state lifecycle",
    "not lifecycle.suggestion_dismissed",
    "workout.status = 'completed'",
    "public.blast_has_elapsed_seven_weeks",
  ]) &&
  hasAll(read("src/HomeScreen.tsx"), [
    "START CRUISE",
    "START NEW BLAST",
    "IT'S BEEN 7 WEEKS",
    "CONSIDER A CRUISE",
  ]) &&
  read("tests/a1-assignment.e2e.mjs").includes(
    "blast_cruise_runtime: blastCruiseRuntime",
  );

process.stdout.write(
  JSON.stringify({
    behavior: {
      blast_cruise_surface_contract: predecessorContract || lifecycleContract,
    },
    scenario: "blast-cruise-v1",
    schema_version: "1.0",
  }),
);
