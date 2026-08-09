import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHEST_EXERCISES, formatTargetRange } from "../src/rotation-assignment.ts";

test("A1 assignment uses only the approved chest pool and explicit ranges", () => {
  assert.equal(CHEST_EXERCISES.length, 9);
  assert.equal(CHEST_EXERCISES.some((exercise) => exercise.includes("†")), false);
  assert.equal(formatTargetRange(11, 15), "11–15");
  assert.equal(formatTargetRange(null, null), "NOT APPLICABLE");

  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260809042610_create_a1_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)\) = user_id/g);
  assert.match(migration, /revoke all .* from anon, authenticated/);
});
