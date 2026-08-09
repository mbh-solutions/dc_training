import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("A1 assignment uses only the approved chest pool and explicit ranges", () => {
  const source = readFileSync(new URL("../src/FoundationHome.tsx", import.meta.url), "utf8");
  const chestPool = source.match(/const CHEST_EXERCISES = \[([\s\S]*?)\] as const;/)?.[1];
  assert.ok(chestPool);
  assert.equal((chestPool.match(/^\s+"/gm) ?? []).length, 9);
  assert.doesNotMatch(chestPool, /†/);
  assert.match(source, /"11-15"/);
  assert.match(source, /"15-20"/);
  assert.match(source, /"custom"/);

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
