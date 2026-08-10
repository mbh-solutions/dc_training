import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const domainSource = readFileSync(
  new URL("../src/workout-domain.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";',
    'const WORKOUT_SLOTS = ["A1", "B1", "A2", "B2", "A3", "B3"];',
  )
  .replace('import type { WeightEntry } from "./weight-conversion.js";', "");
const domainJavascript = ts.transpileModule(domainSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const domain = await import(
  `data:text/javascript,${encodeURIComponent(domainJavascript)}`
);

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260810163233_add_blast_cruise_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const resetMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260810180700_reset_new_blast_enforcement.sql",
    import.meta.url,
  ),
  "utf8",
);
const foundationSource = readFileSync(
  new URL("../src/FoundationHome.tsx", import.meta.url),
  "utf8",
);
const historySource = readFileSync(
  new URL("../src/HistoryScreen.tsx", import.meta.url),
  "utf8",
);
const transitionFunction = migration.match(
  /create or replace function public\.transition_training_lifecycle[\s\S]*?\n\$\$;/,
)?.[0];

test("S07 lifecycle states fail closed and preserve the rotation boundary", () => {
  assert.equal(
    domain.validTrainingLifecycle({
      blast_ended_at: null,
      blast_id: "5af69bce-0f20-49d3-8d64-1acc7b46f480",
      blast_started_at: "2026-08-10T16:00:00Z",
      cruise_started_at: null,
      phase: "blast",
      suggestion_dismissed: false,
      suggestion_due: true,
    }),
    true,
  );
  assert.equal(
    domain.validTrainingLifecycle({
      blast_ended_at: null,
      blast_id: "5af69bce-0f20-49d3-8d64-1acc7b46f480",
      blast_started_at: "2026-08-10T16:00:00Z",
      cruise_started_at: null,
      phase: "cruise",
      suggestion_dismissed: false,
      suggestion_due: false,
    }),
    false,
  );

  assert.ok(transitionFunction, "lifecycle RPC must exist");
  assert.match(transitionFunction, /pg_advisory_xact_lock/);
  assert.match(transitionFunction, /status = 'in_progress'/);
  assert.match(transitionFunction, /training_lifecycle_operations/);
  assert.match(
    transitionFunction,
    /delete from public\.assignment_logbook_states/,
  );
  assert.doesNotMatch(transitionFunction, /workout_rotation_state/);
  assert.doesNotMatch(transitionFunction, /delete from public\.workouts/);

  assert.match(resetMigration, /old\.phase = 'cruise'/);
  assert.match(resetMigration, /new\.phase = 'blast'/);
  assert.match(resetMigration, /enforcement_action = null/);
  assert.match(resetMigration, /step\.user_id = new\.user_id/);
  assert.doesNotMatch(resetMigration, /verdict = null/);
  assert.doesNotMatch(resetMigration, /delete from public\.workouts/);
  assert.doesNotMatch(resetMigration, /workout_rotation_state/);

  assert.match(
    foundationSource,
    /rotationOutsideCruise\(workout\.lifecycle, openRotation\)/,
  );
  assert.match(historySource, /rotationDisabled=\{!onOpenRotation\}/);

  assert.match(migration, /new\.blast_id := lifecycle\.blast_id/);
  assert.match(migration, /workout\.blast_id = current_blast_id/);
  assert.match(migration, /current_blast_id is distinct from active_blast_id/);
  assert.match(migration, /interval '7 weeks'/);
  assert.match(migration, /suggestion_dismissed = true/);
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /grant select on table public\.training_lifecycle_state to authenticated/,
  );
});
