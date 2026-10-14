import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`,
);
const dir = "supabase/migrations";
for (const file of readdirSync(dir)
  .sort()
  .filter(
    (f) =>
      f.endsWith(".sql") &&
      (f < "20260811054903" ||
        f.startsWith("20260812025545") ||
        f.startsWith("20261013") ||
        f.startsWith("20261014")),
  )) {
  try {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  } catch (e) {
    console.error(file, e.message);
    process.exit(1);
  }
}
console.log("Relevant migration chain and new migration applied successfully");
const owner = "00000000-0000-0000-0000-000000000001";
await db.exec(
  `insert into auth.users values('${owner}'); select set_config('request.jwt.claim.sub','${owner}',false);`,
);
for (const slot of ["B1", "B3"]) {
  for (const [part, exercise, protocol, structure, targets] of [
    [
      "biceps",
      "Straight-bar curl",
      "rest_pause",
      "11-15",
      [{ min: 11, max: 15 }],
    ],
    [
      "forearms",
      "Alternating hammer curl",
      "straight_set",
      "single-10-20",
      [{ min: 10, max: 20 }],
    ],
    [
      "calves",
      "Standing barbell calf raise",
      "straight_set",
      "single-10-12",
      [{ min: 10, max: 12 }],
    ],
    [
      "hamstrings",
      "Lying leg curl",
      "rest_pause",
      "15-30",
      [{ min: 15, max: 30 }],
    ],
    [
      "quadriceps",
      "Leg extension",
      "straight_set",
      "single-10-15",
      [{ min: 10, max: 15 }],
    ],
    ["abs_1", "Reverse crunch", "straight_set", "none", []],
    ["abs_2", "Dead Bug", "straight_set", "none", []],
  ])
    await db.query(
      `select public.save_rotation_assignment($1,$2,$3,$4,$5,$6::jsonb)`,
      [slot, part, exercise, protocol, structure, JSON.stringify(targets)],
    );
}
await db.exec(
  `insert into public.workout_rotation_state(user_id,next_slot) values('${owner}','B1');`,
);
const first = (
  await db.query(`select * from public.start_workout(gen_random_uuid())`)
).rows[0];
let steps = (
  await db.query(
    `select * from public.workout_steps where workout_id=$1 order by ordinal`,
    [first.workout_id],
  )
).rows;
assert.equal(steps.length, 9);
assert.equal(steps.filter((s) => s.body_part.startsWith("abs")).length, 1);
for (const step of steps) {
  const save = step.body_part === "hamstrings" && step.kind === "exercise";
  await db.query(
    `select public.save_workout_step($1,gen_random_uuid(),$2,$3::jsonb,$4::integer[],null)`,
    [
      step.step_id,
      save ? "completed" : "skipped",
      JSON.stringify(save ? [{ amount: "100", unit: "lb" }] : []),
      save ? [10, 3, 2] : [],
    ],
  );
}
await db.exec(
  `update public.workout_rotation_state set next_slot='B3' where user_id='${owner}';`,
);
const second = (
  await db.query(`select * from public.start_workout(gen_random_uuid())`)
).rows[0];
const leg = (
  await db.query(
    `select * from public.workout_steps where workout_id=$1 and body_part='hamstrings' and kind='exercise'`,
    [second.workout_id],
  )
).rows[0];
assert.deepEqual(leg.previous_reps, [10, 3, 2]);
assert.equal(leg.previous_weight_entries[0].amount, "100");
assert.equal(leg.fresh_baseline, false);
for (const kind of ["body_weight", "bar", "band"]) {
  const normalized = (
    await db.query(
      `select public.normalize_workout_performance('straight_set','[]',$1::jsonb,array[12],null) value`,
      [JSON.stringify([{ amount: "0", unit: "lb", kind }])],
    )
  ).rows[0].value;
  assert.equal(normalized.weight_entries[0].kind, kind);
  assert.equal(normalized.weight_entries[0].micrograms, "0");
}
const comparison = (
  await db.query(
    `select public.evaluate_logbook_performance('chest','straight_set','[]','[{"micrograms":"110"}]',array[8],null,'[{"micrograms":"100"}]',array[10],null) value`,
  )
).rows[0].value;
assert.equal(comparison.status, "win");
await assert.rejects(
  db.query(
    `select public.correct_workout_performance($1,gen_random_uuid(),'[{"amount":"95","unit":"lb"}]',array[10,3,2],null)`,
    [
      steps.find((s) => s.body_part === "hamstrings" && s.kind === "exercise")
        .step_id,
    ],
  ),
  /Finish active workout/,
);

const secondSteps = (
  await db.query(
    `select * from public.workout_steps where workout_id=$1 order by ordinal`,
    [second.workout_id],
  )
).rows;
for (const step of secondSteps.filter((s) => s.ordinal <= leg.ordinal)) {
  const completed = step.step_id === leg.step_id;
  await db.query(
    `select public.save_workout_step($1,gen_random_uuid(),$2,$3::jsonb,$4::integer[],null)`,
    [
      step.step_id,
      completed ? "completed" : "skipped",
      JSON.stringify(completed ? [{ amount: "110", unit: "lb" }] : []),
      completed ? [10, 3, 2] : [],
    ],
  );
}
await db.query(
  `select public.correct_workout_performance($1,gen_random_uuid(),'[{"amount":"120","unit":"lb"}]',array[10,3,2],null)`,
  [leg.step_id],
);
const corrected = (
  await db.query(`select * from public.workout_steps where step_id=$1`, [
    leg.step_id,
  ])
).rows[0];
assert.equal(corrected.weight_entries[0].amount, "120");
assert.equal(corrected.verdict, "win");
for (const step of secondSteps.filter((s) => s.ordinal > leg.ordinal))
  await db.query(
    `select public.save_workout_step($1,gen_random_uuid(),'skipped','[]','{}',null)`,
    [step.step_id],
  );
await db.query(
  `select public.correct_workout_performance($1,gen_random_uuid(),'[{"amount":"95","unit":"lb"}]',array[10,3,2],null)`,
  [
    steps.find((s) => s.body_part === "hamstrings" && s.kind === "exercise")
      .step_id,
  ],
);
assert.equal(
  (
    await db.query(
      `select previous_weight_entries from public.workout_steps where step_id=$1`,
      [leg.step_id],
    )
  ).rows[0].previous_weight_entries[0].amount,
  "95",
);
await db.exec(
  `update public.workout_rotation_state set next_slot='B1' where user_id='${owner}'`,
);
const third = (
  await db.query(`select * from public.start_workout(gen_random_uuid())`)
).rows[0];
assert.equal(
  (
    await db.query(
      `select previous_weight_entries from public.workout_steps where workout_id=$1 and body_part='hamstrings' and kind='exercise'`,
      [third.workout_id],
    )
  ).rows[0].previous_weight_entries[0].amount,
  "120",
);
console.log(
  "PASS: backward workout correction, dependent cross-slot recalculation, B3 to B1 latest performance",
);
console.log(
  "PASS: one ab, legacy second ab retained, B1 to B3 shared history, all three load labels, estimated strength, cross-slot correction guard",
);

async function logHamstrings(workout, amount) {
  const rows = (
    await db.query(
      `select * from public.workout_steps where workout_id=$1 order by ordinal`,
      [workout.workout_id],
    )
  ).rows;
  let logged;
  for (const step of rows) {
    const target = step.body_part === "hamstrings" && step.kind === "exercise";
    const result = (
      await db.query(
        `select public.save_workout_step($1,gen_random_uuid(),$2,$3::jsonb,$4::integer[],null) result`,
        [
          step.step_id,
          target ? "completed" : "skipped",
          JSON.stringify(target ? [{ amount, unit: "lb" }] : []),
          target ? [10, 3, 2] : [],
        ],
      )
    ).rows[0].result;
    if (target) {
      logged = result.step;
      if (logged.enforcement_action) return logged;
    }
  }
  return logged;
}
async function finishPending(workout) {
  for (const step of (
    await db.query(
      `select * from public.workout_steps where workout_id=$1 and status='pending' order by ordinal`,
      [workout.workout_id],
    )
  ).rows)
    await db.query(
      `select public.save_workout_step($1,gen_random_uuid(),'skipped','[]','{}',null)`,
      [step.step_id],
    );
}
async function startSlot(slot) {
  await db.query(
    `update public.workout_rotation_state set next_slot=$1 where user_id=$2`,
    [slot, owner],
  );
  return (
    await db.query(`select * from public.start_workout(gen_random_uuid())`)
  ).rows[0];
}
const failure = await logHamstrings(third, "110");
assert.equal(failure.enforcement_action, "first_failure");
await db.query(
  `select public.resolve_logbook_action($1,gen_random_uuid(),'use_mulligan')`,
  [failure.step_id],
);
await finishPending(third);
const fourth = await startSlot("B3");
const crossFailure = await logHamstrings(fourth, "100");
assert.equal(crossFailure.mulligan_used, true);
assert.equal(crossFailure.enforcement_action, "replacement_required");
await db.query(`select public.undo_workout_step($1,gen_random_uuid())`, [
  crossFailure.last_operation_id,
]);
const undone = (
  await db.query(`select * from public.workout_steps where step_id=$1`, [
    crossFailure.step_id,
  ])
).rows[0];
assert.equal(undone.status, "pending");
const winning = (
  await db.query(
    `select public.save_workout_step($1,gen_random_uuid(),'completed','[{"amount":"130","unit":"lb"}]',array[10,3,2],null) result`,
    [crossFailure.step_id],
  )
).rows[0].result.step;
assert.equal(winning.verdict, "win");
assert.equal(winning.enforcement_action, null);
await finishPending(fourth);
const fifth = await startSlot("B1");
const firstFailureAgain = await logHamstrings(fifth, "120");
assert.equal(firstFailureAgain.mulligan_used, false);
assert.equal(firstFailureAgain.enforcement_action, "first_failure");
await assert.rejects(
  db.query(
    `select public.normalize_workout_performance('rest_pause','[{"min":11,"max":15}]','[{"amount":"100","unit":"lb"}]',array[2147483648]::integer[],null)`,
  ),
  /out of range/,
);
console.log(
  "PASS: cross-slot mulligan, second failure, undo, shared win reset, integer bounds",
);
await db.close();
