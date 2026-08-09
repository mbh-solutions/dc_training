import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("S01 A1 chest contract survives the S02 expansion", () => {
  const config = readFileSync(
    new URL("../src/rotation-config.ts", import.meta.url),
    "utf8",
  );
  const chestPool = config.match(/chest: \[([\s\S]*?)\n  \],/)?.[1];
  assert.ok(chestPool);
  assert.equal((chestPool.match(/^    "/gm) ?? []).length, 9);
  assert.doesNotMatch(chestPool, /†/);
  assert.match(config, /Classic DC uses one rest-pause work set\./);
  assert.match(config, /value: "11-15"/);
  assert.match(config, /value: "15-20"/);

  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260809063758_expand_rotation_assignments.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /security invoker/);
  assert.match(migration, /owner_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(migration, /where active/);
  assert.match(migration, /replaced_assignment_id/);
  assert.match(migration, /grant execute .* to authenticated/);
  assert.match(migration, /from public, anon/);
});
