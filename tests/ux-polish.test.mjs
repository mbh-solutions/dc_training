import assert from "node:assert/strict";

import {
  source,
  mount,
  click,
  input,
  act,
  createElement,
  dom,
  account,
  start,
  save,
  finish,
  apply,
  offlineView,
} from "./behavior-runtime.mjs";
const { default: FoundationHome } = await source("FoundationHome.tsx");
const { WorkoutTracer, WorkoutComplete } = await source("WorkoutTracer.tsx");
const { SettingsScreen, NetworkStatus } = await source("HomeScreen.tsx");
const { default: RotationSetup } = await source("RotationSetup.tsx");
const { default: HistoryScreen } = await source("HistoryScreen.tsx");
const { workoutEntryShape } = await source("workout-domain.ts");
const config = await source("rotation-config.ts");
const { resolveAssignmentDraft } = await source("rotation-assignment-draft.ts");
const results = [];
let mounted = [];
const view = async (C, p) => {
  let m = await mount(C, p);
  mounted.push(m);
  return m;
};
const visible = (e) => !e.closest("[hidden]");
const button = (c, label) =>
  [...c.querySelectorAll("button")]
    .sort(
      (a, b) =>
        Number(!!b.closest("[role=dialog]")) -
        Number(!!a.closest("[role=dialog]")),
    )
    .find(
      (b) =>
        visible(b) &&
        (b.textContent.trim() === label ||
          b.getAttribute("aria-label") === label),
    );
const press = async (c, label) => {
  const b = button(c, label);
  assert.ok(b, `Missing ${label}`);
  assert.ok(!b.disabled, `Disabled ${label}`);
  await act(async () => b.click());
};
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", actual: e.message });
    console.log("FAIL", name, e.message);
  } finally {
    for (const m of mounted) await m.close();
    mounted = [];
  }
};
const homeProps = {
  userId: "owner",
  email: "audit@example.invalid",
  online: true,
  cloudStatus: "ready",
  onSignOut: async () => {},
};
async function homeFixture(initial = account()) {
  let state = initial;
  const ops = [];
  const commit = async (op) => {
    ops.push(op);
    try {
      state = apply(state, op.kind, op.payload);
      globalThis.__testOffline = offlineView(state, commit);
      return { data: state, error: "" };
    } catch (e) {
      return { data: null, error: e.message };
    }
  };
  globalThis.__testOffline = offlineView(state, commit);
  const m = await view(FoundationHome, homeProps);
  return {
    ...m,
    get state() {
      return state;
    },
    ops,
    commit,
  };
}
const tracerProps = (s) => ({
  workout: s.workout.workout,
  steps: s.workout.steps,
  weightUnit: "lb",
  actionSaving: false,
  blockingStep: null,
  lastOperationId: null,
  lastOperationStatus: null,
  message: "",
  onBeginReplacement: () => {},
  onExit: () => {},
  onResolveAction: async () => true,
  onSave: async () => false,
  onCorrect: async () => false,
  onSkip: async () => false,
  onUndo: async () => {},
});
await check(
  "Home navigation: history, rotation, Settings and Back",
  async () => {
    const h = await homeFixture();
    for (const label of ["Settings", "\u25f7 HISTORY", "\u27f3 ROTATION"]) {
      const b = [...h.container.querySelectorAll("button")].find(
        (x) =>
          visible(x) &&
          (x.getAttribute("aria-label") === label ||
            x.textContent.includes(label.split(" ").at(-1))),
      );
      await act(async () => b.click());
      if (label === "Settings") await press(h.container, "Back");
      else if (label.includes("ROTATION")) await press(h.container, "Back");
      else await press(h.container, "\u2302HOME");
    }
  },
);
for (const slot of config.WORKOUT_SLOTS)
  await check(
    `Complete ${slot}: every exercise and stretch save button`,
    async () => {
      const h = await homeFixture(account(slot));
      await press(h.container, `START ${slot}`);
      let exerciseCount = 0,
        stretchCount = 0;
      while (h.state.workout.workout) {
        const step = h.state.workout.steps.find((s) => s.status === "pending");
        assert.ok(step);
        if (step.kind === "stretch") {
          await press(h.container, "STRETCH INFORMATION");
          assert.ok(h.container.querySelector("[role=dialog]"));
          await press(h.container, "GOT IT");
          await press(h.container, "STRETCH COMPLETE");
          stretchCount++;
        } else {
          const shape = workoutEntryShape(step);
          for (let i = 0; i < shape.weightCount; i++)
            await input(h.container, `#weight-${i}`, "100");
          for (let i = 0; i < shape.valueCount; i++)
            await input(
              h.container,
              shape.metric === "seconds" ? "#duration-seconds" : `#rep-${i}`,
              shape.metric === "seconds" ? 30 : 10,
            );
          await press(h.container, "SAVE & NEXT");
          exerciseCount++;
        }
      }
      assert.match(h.container.textContent, new RegExp(`${slot} COMPLETE`));
      assert.equal(h.state.history.workouts[0].status, "completed");
      return { exerciseCount, stretchCount };
    },
  );
await check(
  "Save and Skip disabled for empty/invalid entry; valid input enables Save",
  async () => {
    const m = await view(WorkoutTracer, tracerProps(start(account())));
    assert.ok(button(m.container, "SAVE & NEXT").disabled);
    await input(m.container, "#weight-0", "100");
    for (const bad of ["0", "-1", "2.5", "no"]) {
      for (let i = 0; i < 3; i++) await input(m.container, `#rep-${i}`, bad);
      assert.ok(button(m.container, "SAVE & NEXT").disabled);
    }
    for (let i = 0; i < 3; i++) await input(m.container, `#rep-${i}`, 3);
    assert.ok(!button(m.container, "SAVE & NEXT").disabled);
  },
);
await check(
  "Workout rejects rep counts outside PostgreSQL integer range before saving",
  async () => {
    const h = await homeFixture();
    await press(h.container, "START A1");
    await input(h.container, "#weight-0", 100);
    for (let i = 0; i < 3; i++)
      await input(h.container, `#rep-${i}`, i === 0 ? "2147483648" : 3);
    assert.ok(
      button(h.container, "SAVE & NEXT").disabled,
      "Save remains enabled for 2,147,483,648 reps",
    );
  },
);
await check(
  "Leaving and resuming preserves unsaved weight/reps or asks before discarding",
  async () => {
    const h = await homeFixture();
    await press(h.container, "START A1");
    await input(h.container, "#weight-0", 100);
    await input(h.container, "#rep-0", 8);
    await press(h.container, "LEAVE WORKOUT");
    if (h.container.querySelector("[role=dialog]"))
      return "Exit confirmation shown";
    await press(h.container, "RESUME A1");
    assert.equal(
      h.container.querySelector("#weight-0").value,
      "100",
      "Draft weight silently cleared",
    );
  },
);
await check(
  "Skip, undo skip, save, undo save restore the correct pending step",
  async () => {
    const h = await homeFixture();
    await press(h.container, "START A1");
    await press(h.container, "SKIP");
    assert.equal(h.state.workout.steps[0].status, "skipped");
    await press(h.container, "UNDO");
    assert.equal(h.state.workout.steps[0].status, "pending");
    await input(h.container, "#weight-0", 100);
    for (let i = 0; i < 3; i++) await input(h.container, `#rep-${i}`, 3);
    await press(h.container, "SAVE & NEXT");
    await press(h.container, "UNDO");
    assert.equal(h.state.workout.steps[0].status, "pending");
    assert.equal(h.state.history.workouts.length, 1);
  },
);
await check(
  "Prior-exercise edit preserves current draft and saves correction",
  async () => {
    const h = await homeFixture();
    await press(h.container, "START A1");
    await input(h.container, "#weight-0", 100);
    for (let i = 0; i < 3; i++) await input(h.container, `#rep-${i}`, 3);
    await press(h.container, "SAVE & NEXT");
    await press(h.container, "STRETCH COMPLETE");
    await input(h.container, "#weight-0", 55);
    await press(h.container, "PREVIOUS EXERCISE");
    await input(h.container, "#weight-0", 105);
    await press(h.container, "SAVE CHANGES");
    assert.equal(h.state.workout.steps[0].weight_entries[0].amount, "105");
    assert.equal(h.container.querySelector("#weight-0").value, "55");
  },
);
for (const kind of ["body_weight", "bar", "band"])
  await check(`Load type ${kind} records without numeric weight`, async () => {
    const h = await homeFixture();
    await press(h.container, "START A1");
    await act(async () => {
      const select = h.container.querySelector("select");
      select.value = kind;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(h.container.querySelector("#weight-0"), null);
    for (let i = 0; i < 3; i++) await input(h.container, `#rep-${i}`, 3);
    await press(h.container, "SAVE & NEXT");
    assert.equal(h.state.workout.steps[0].weight_entries[0].kind, kind);
  });
await check("Slow Save prevents duplicate submissions", async () => {
  let calls = 0,
    release;
  const gate = new Promise((r) => (release = r));
  const m = await view(WorkoutTracer, {
    ...tracerProps(start(account())),
    onSave: async () => {
      calls++;
      await gate;
      return false;
    },
  });
  await input(m.container, "#weight-0", 100);
  for (let i = 0; i < 3; i++) await input(m.container, `#rep-${i}`, 3);
  await press(m.container, "SAVE & NEXT");
  assert.ok(button(m.container, "SAVING").disabled);
  await act(async () => button(m.container, "SAVING").click());
  assert.equal(calls, 1);
  await act(async () => release());
  assert.ok(!button(m.container, "SAVE & NEXT").disabled);
});
await check(
  "Failed Save preserves entered values and allows retry",
  async () => {
    let calls = 0;
    const m = await view(WorkoutTracer, {
      ...tracerProps(start(account())),
      message: "DEVICE STORAGE FULL",
      onSave: async () => {
        calls++;
        return false;
      },
    });
    await input(m.container, "#weight-0", 100);
    for (let i = 0; i < 3; i++) await input(m.container, `#rep-${i}`, 3);
    await press(m.container, "SAVE & NEXT");
    assert.equal(m.container.querySelector("#weight-0").value, "100");
    assert.match(m.container.textContent, /DEVICE STORAGE FULL/);
    await press(m.container, "SAVE & NEXT");
    assert.equal(calls, 2);
  },
);
await check(
  "Settings failed weight-unit change retries successfully",
  async () => {
    let attempts = 0;
    const m = await view(SettingsScreen, {
      editingEnabled: true,
      email: "audit@example.invalid",
      online: true,
      onBack: () => {},
      onChangeUnit: async () => ++attempts > 1,
      onSignOut: async () => {},
      syncState: "synced",
      unit: "lb",
      userId: "owner",
    });
    await press(m.container, "KG");
    assert.match(
      m.container.textContent,
      /could not|failed|try again|not saved/i,
      "No error message after failed unit change",
    );
    await press(m.container, "TRY AGAIN");
    assert.equal(attempts, 2);
    assert.equal(m.container.querySelector("[role=alert]"), null);
  },
);
await check(
  "Settings disables sign-out/deletion while offline and preserves unit toggle",
  async () => {
    let chosen;
    const m = await view(SettingsScreen, {
      editingEnabled: true,
      email: "audit@example.invalid",
      online: false,
      onBack: () => {},
      onChangeUnit: async (u) => {
        chosen = u;
        return true;
      },
      onSignOut: async () => {},
      syncState: "synced",
      unit: "lb",
      userId: "owner",
    });
    assert.ok(button(m.container, "SIGN OUT").disabled);
    assert.ok(button(m.container, "DELETE ACCOUNT").disabled);
    await press(m.container, "KG");
    assert.equal(chosen, "kg");
  },
);
await check(
  "Deletion gate requires acknowledgement; Keep Account closes it",
  async () => {
    const m = await view(SettingsScreen, {
      editingEnabled: true,
      email: "audit@example.invalid",
      online: true,
      onBack: () => {},
      onChangeUnit: async () => true,
      onSignOut: async () => {},
      syncState: "synced",
      unit: "lb",
      userId: "owner",
    });
    await press(m.container, "DELETE ACCOUNT");
    assert.ok(button(m.container, "BEGIN 30-DAY DELETION").disabled);
    await press(m.container, "KEEP ACCOUNT");
    assert.ok(button(m.container, "DELETE ACCOUNT"));
  },
);
await check(
  "Cruise requires confirmation and Cancel preserves blast",
  async () => {
    const h = await homeFixture();
    await press(h.container, "START CRUISE");
    assert.ok(h.container.querySelector("[role=dialog]"));
    await press(h.container, "CANCEL");
    assert.equal(h.ops.length, 0);
    await press(h.container, "START CRUISE");
    await press(h.container, "START CRUISE");
    assert.equal(h.state.workout.lifecycle.phase, "cruise");
    await press(h.container, "START NEW BLAST");
    assert.equal(h.state.workout.lifecycle.phase, "blast");
  },
);
await check(
  "All catalogue protocol/structure combinations produce valid target drafts",
  async () => {
    let count = 0;
    for (const p of config.ASSIGNMENT_POSITIONS.filter((p) => p !== "abs_2"))
      for (const exercise of config.EXERCISES[config.categoryFor(p)])
        for (const proto of config.protocolChoices(p, exercise)) {
          let choices = config.structureChoices(p, exercise, proto.value);
          if (!choices.length) choices = [{ value: "none" }];
          for (const choice of choices) {
            const r = resolveAssignmentDraft(
              p,
              exercise,
              proto.value,
              choice.value,
              [{ min: "10", max: "15" }],
            );
            assert.ok(
              r.structureValid,
              `${p} ${exercise} ${proto.value} ${choice.value}`,
            );
            count++;
          }
        }
    return { combinations: count };
  },
);
await check(
  "Rotation accordions, Back, all wizard stages, custom RP save",
  async () => {
    let state = account(),
      calls = 0;
    const commit = async (op) => {
      calls++;
      state = apply(state, op.kind, op.payload);
      return { data: state, error: "" };
    };
    const m = await view(RotationSetup, {
      accountState: state,
      commitOperation: commit,
      onBack: () => {},
    });
    await act(async () => m.container.querySelector(".workout-toggle").click());
    await act(async () =>
      m.container.querySelector(".assignment-card").click(),
    );
    await press(m.container, "CONTINUE");
    await press(m.container, "Back");
    assert.ok(m.container.querySelector("input[name=exercise]"));
    await press(m.container, "CONTINUE");
    await press(m.container, "CONTINUE");
    await act(async () =>
      m.container.querySelector("input[value=custom]").click(),
    );
    assert.equal(m.container.querySelectorAll("[id^=custom-min]").length, 1);
    await input(m.container, "#custom-min-0", 11);
    await input(m.container, "#custom-max-0", 15);
    await press(m.container, "CONTINUE");
    await press(m.container, "SAVE");
    assert.equal(calls, 1);
    assert.equal(state.assignments["A1:chest"].structure, "custom");
  },
);
await check(
  "History correction permits changing a mistakenly selected load type",
  async () => {
    let s = start(account());
    s = save(
      s,
      s.workout.steps[0],
      [{ amount: "0", unit: "lb", kind: "band" }],
      [8, 3, 2],
    );
    s = finish(s);
    let correction;
    const m = await view(HistoryScreen, {
      accountState: s,
      commitOperation: async (op) => {
        correction = op;
        s = apply(s, op.kind, op.payload);
        return { data: s, error: "" };
      },
      onHome: () => {},
      weightUnit: "lb",
    });
    await input(m.container, "#history-search", "Incline");
    await act(async () =>
      m.container.querySelector(".history-search-results button").click(),
    );
    await act(async () =>
      m.container.querySelector(".performance-rows button").click(),
    );
    assert.ok(
      m.container.querySelector("[role=dialog] select"),
      "No load-type selector in correction dialog",
    );
    assert.equal(m.container.querySelector("#correction-weight-0"), null);
    await act(async () => {
      const select = m.container.querySelector("[role=dialog] select");
      select.value = "weight";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await input(m.container, "#correction-weight-0", "100");
    await act(async () =>
      m.container
        .querySelector(".correction-dialog")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(correction.payload.weights[0].amount, "100");
    assert.equal(correction.payload.weights[0].micrograms, "45359237000");
    assert.equal(
      s.history.steps.find((step) => step.status === "completed")
        .weight_entries[0].kind ?? "weight",
      "weight",
    );
  },
);
await check(
  "History charts maintain one continuous series for one exercise reused across slots",
  async () => {
    let s = account("A1");
    for (let j = 0; j < 3; j++) {
      s.workout.nextSlot = ["A1", "A2", "A1"][j];
      s = start(s);
      s = save(
        s,
        s.workout.steps[0],
        [{ amount: String(100 + j * 5), unit: "lb" }],
        [8, 3, 2],
      );
      s = finish(s);
    }
    const m = await view(HistoryScreen, {
      accountState: s,
      commitOperation: async () => ({ data: s, error: "" }),
      onHome: () => {},
      weightUnit: "lb",
    });
    await input(m.container, "#history-search", "Incline");
    await act(async () =>
      m.container.querySelector(".history-search-results button").click(),
    );
    const charts = m.container.querySelectorAll(
      'svg[aria-label="WEIGHT progression"]',
    );
    assert.equal(
      charts.length,
      1,
      `${charts.length} separate charts for same exercise`,
    );
  },
);
await check(
  "Retry sync button calls retry; conflict review calls review",
  async () => {
    let retry = 0,
      review = 0;
    const props = {
      conflictDeferred: false,
      online: true,
      onRetrySync: async () => {
        retry++;
        return false;
      },
      onReviewConflict: () => review++,
      syncState: "failed",
    };
    const m = await view(NetworkStatus, props);
    await press(m.container, "TRY AGAIN");
    assert.equal(retry, 1);
    await m.render({ ...props, conflictDeferred: true, syncState: "conflict" });
    const b = [...m.container.querySelectorAll("button")][0];
    assert.ok(b);
    await act(async () => b.click());
    assert.equal(review, 1);
  },
);
await check(
  "Conflict: device-copy details, defer and unsuccessful restore are actionable",
  async () => {
    let deferred = 0,
      restored = 0;
    globalThis.__testOffline = {
      ...offlineView(account(), async () => ({ data: null, error: "" })),
      conflict: {
        batchId: "b",
        status: "stale",
        pendingCount: 1,
        operations: [{ id: "o", label: "Save chest" }],
      },
      reviewConflict: () => {},
      deferConflict: () => deferred++,
      useCloudConflict: async () => {
        restored++;
        return false;
      },
      syncState: "conflict",
    };
    const m = await view(FoundationHome, homeProps);
    await press(m.container, "REVIEW DEVICE COPY");
    assert.match(m.container.textContent, /Save chest/);
    await press(m.container, "USE CLOUD DATA");
    assert.match(m.container.textContent, /COULD NOT BE RESTORED/);
    await press(m.container, "NOT NOW");
    assert.equal(deferred, 1);
    assert.equal(restored, 1);
  },
);
for (const action of ["first_failure", "replacement_required", "abs_choice"])
  await check(`Logbook ${action}: action buttons route correctly`, async () => {
    let resolved,
      replace = 0;
    const s = start(account());
    const step = {
      ...s.workout.steps[0],
      status: "completed",
      enforcement_action: action,
      weight_entries: [
        { amount: "100", unit: "lb", micrograms: "45359237000" },
      ],
      previous_weight_entries: [
        { amount: "110", unit: "lb", micrograms: "49895160700" },
      ],
      reps: [8, 3, 2],
      previous_reps: [8, 3, 2],
    };
    const m = await view(WorkoutTracer, {
      ...tracerProps(s),
      blockingStep: step,
      onResolveAction: async (_step, a) => {
        resolved = a;
        return true;
      },
      onBeginReplacement: () => replace++,
    });
    if (action === "abs_choice") {
      await press(m.container, "COUNT AS WIN");
      assert.equal(resolved, "count_win");
      await press(m.container, "COUNT AS FAILURE");
      assert.equal(resolved, "count_failure");
    } else {
      if (action === "first_failure") {
        await press(m.container, "USE MULLIGAN");
        assert.equal(resolved, "use_mulligan");
      }
      await press(m.container, "REPLACE EXERCISE");
      assert.equal(replace, 1);
    }
  });

await check(
  "History search finds the renamed legacy Lying leg curl",
  async () => {
    const s = account("B1");
    for (const a of Object.values(s.assignments))
      if (a.body_part === "hamstrings") a.exercise = "Lying Deltech leg curl";
    const m = await view(HistoryScreen, {
      accountState: s,
      commitOperation: async () => ({ data: s, error: "" }),
      onHome: () => {},
      weightUnit: "lb",
    });
    await input(m.container, "#history-search", "Lying leg curl");
    assert.ok(
      m.container.querySelector(".history-search-results button"),
      "Renamed exercise not found by displayed name",
    );
  },
);
await check(
  "Timed hold saves duration and the selected load type",
  async () => {
    let s = start(account("B1"));
    let step = s.workout.steps.find((x) => x.body_part === "abs_1");
    step = { ...step, ordinal: 1, protocol: "timed_hold", target_sets: [] };
    let recorded;
    const m = await view(WorkoutTracer, {
      ...tracerProps(s),
      steps: [step],
      onSave: async (...args) => {
        recorded = args;
        return false;
      },
    });
    await input(m.container, "#weight-0", 25);
    await input(m.container, "#duration-seconds", 45);
    await press(m.container, "SAVE & NEXT");
    assert.equal(recorded[3], 45);
    assert.deepEqual(recorded[2], []);
  },
);
await check(
  "Ten custom straight sets expose and save all ten lanes",
  async () => {
    const s = start(account());
    const step = {
      ...s.workout.steps[0],
      protocol: "straight_set",
      structure: "custom",
      target_sets: Array.from({ length: 10 }, () => ({ min: 10, max: 15 })),
    };
    let recorded;
    const m = await view(WorkoutTracer, {
      ...tracerProps(s),
      steps: [step],
      onSave: async (...args) => {
        recorded = args;
        return false;
      },
    });
    for (let i = 0; i < 10; i++) {
      await input(m.container, `#weight-${i}`, 50 + i);
      await input(m.container, `#rep-${i}`, 10 + i);
    }
    await press(m.container, "SAVE & NEXT");
    assert.equal(recorded[1].length, 10);
    assert.equal(recorded[2][9], 19);
  },
);
await check(
  "Calf technique dialog opens and both close controls work",
  async () => {
    const s = start(account("B1"));
    let step = s.workout.steps.find((x) => x.body_part === "calves");
    step = {
      ...step,
      ordinal: 1,
      protocol: "straight_set",
      structure: "single-10-12",
      target_sets: [{ min: 10, max: 12 }],
    };
    const m = await view(WorkoutTracer, { ...tracerProps(s), steps: [step] });
    await press(m.container, "CALF 10\u201312 INFORMATION");
    assert.ok(m.container.querySelector("[role=dialog]"));
    await press(m.container, "GOT IT");
    assert.equal(m.container.querySelector("[role=dialog]"), null);
    await press(m.container, "CALF 10\u201312 INFORMATION");
    await press(m.container, "CLOSE CALF 10\u201312 INFORMATION");
    assert.equal(m.container.querySelector("[role=dialog]"), null);
  },
);
await check(
  "Completed workout: undo and Done callbacks route correctly",
  async () => {
    let undo = 0,
      done = 0;
    const s = finish(start(account()));
    const m = await view(WorkoutComplete, {
      lastOperationStatus: "skipped",
      message: "",
      nextSlot: "B1",
      onDone: () => done++,
      onUndo: async () => undo++,
      workout: s.history.workouts[0],
    });
    await press(m.container, "UNDO SKIP");
    await press(m.container, "DONE");
    assert.equal(undo, 1);
    assert.equal(done, 1);
  },
);
await check(
  "Sync upgrade: retry, disclosure, go back and continue paths",
  async () => {
    let retry = 0,
      continued = 0;
    globalThis.__testOffline = {
      ...offlineView(account(), async () => ({ data: null, error: "" })),
      deviceAccess: "upgrade_required",
      retry: async () => {
        retry++;
        return false;
      },
      continueSyncUpgradeHere: async () => {
        continued++;
        return false;
      },
    };
    const m = await view(FoundationHome, homeProps);
    await press(m.container, "TRY AGAIN");
    await press(m.container, "CONTINUE ON THIS DEVICE");
    assert.match(m.container.textContent, /cannot be recovered/);
    await press(m.container, "GO BACK");
    await press(m.container, "CONTINUE ON THIS DEVICE");
    await press(m.container, "CONTINUE ON THIS DEVICE");
    assert.equal(retry, 1);
    assert.equal(continued, 1);
  },
);
await check(
  "Auth: reset needs email; invalid login gives a generic failure",
  async () => {
    const { SignInScreen } = await source("AuthScreens.tsx");
    const m = await view(SignInScreen, {});
    await press(m.container, "FORGOT PASSWORD?");
    assert.match(m.container.textContent, /Enter your email first/);
    await input(m.container, "#email", "audit@example.invalid");
    await input(m.container, "#password", "bad-test-password");
    await act(async () =>
      m.container
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.match(m.container.textContent, /Sign-in failed/);
  },
);
await check(
  "Password recovery: short and mismatched inputs stay on form",
  async () => {
    const { ResetPasswordScreen } = await source("AuthScreens.tsx");
    let done = 0;
    const m = await view(ResetPasswordScreen, { onComplete: () => done++ });
    await input(m.container, "#new-password", "short");
    await act(async () =>
      m.container
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.match(m.container.textContent, /at least 12/);
    await input(m.container, "#new-password", "long-synthetic-password");
    await input(
      m.container,
      "#confirm-password",
      "mismatch-synthetic-password",
    );
    await act(async () =>
      m.container
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.match(m.container.textContent, /do not match/);
    assert.equal(done, 0);
  },
);

await check(
  "Mulligan is enforced on the next appearance in the same slot",
  async () => {
    let s = account("A1");
    for (const amount of ["100", "90"]) {
      s.workout.nextSlot = "A1";
      s = start(s);
      s = save(s, s.workout.steps[0], [{ amount, unit: "lb" }], [8, 3, 2]);
      const step = s.workout.steps[0];
      if (step.enforcement_action)
        s = apply(s, "resolve_logbook_action", {
          ...(await source("offline-sync.ts")).stepTarget(s, step),
          action: "use_mulligan",
        });
      s = finish(s);
    }
    s.workout.nextSlot = "A1";
    s = start(s);
    s = save(s, s.workout.steps[0], [{ amount: "80", unit: "lb" }], [8, 3, 2]);
    assert.equal(s.workout.steps[0].enforcement_action, "replacement_required");
  },
);
await check(
  "Mulligan follows the same exercise when its next appearance is in another slot",
  async () => {
    let s = account("A1");
    for (const amount of ["100", "90"]) {
      s.workout.nextSlot = "A1";
      s = start(s);
      s = save(s, s.workout.steps[0], [{ amount, unit: "lb" }], [8, 3, 2]);
      const step = s.workout.steps[0];
      if (step.enforcement_action)
        s = apply(s, "resolve_logbook_action", {
          ...(await source("offline-sync.ts")).stepTarget(s, step),
          action: "use_mulligan",
        });
      s = finish(s);
    }
    s.workout.nextSlot = "A2";
    s = start(s);
    s = save(s, s.workout.steps[0], [{ amount: "80", unit: "lb" }], [8, 3, 2]);
    assert.equal(
      s.workout.steps[0].enforcement_action,
      "replacement_required",
      "Same exercise receives another first-failure/mulligan choice in A2",
    );
  },
);

await check(
  "Dialog contains focus, blocks background, closes on Escape and returns focus",
  async () => {
    const s = start(account());
    const step = s.workout.steps.find((x) => x.kind === "stretch");
    const m = await view(WorkoutTracer, { ...tracerProps(s), steps: [step] });
    const trigger = button(m.container, "STRETCH INFORMATION");
    trigger.focus();
    await press(m.container, "STRETCH INFORMATION");
    const dialog = m.container.querySelector("[role=dialog]");
    assert.ok(dialog.contains(document.activeElement));
    const got = button(m.container, "GOT IT");
    got.focus();
    await act(async () =>
      got.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(
      document.activeElement.getAttribute("aria-label"),
      "CLOSE STRETCH INFORMATION",
    );
    assert.ok(button(m.container, "STRETCH COMPLETE").inert);
    await act(async () =>
      document.activeElement.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(m.container.querySelector("[role=dialog]"), null);
    assert.equal(document.activeElement, trigger);
    assert.ok(!button(m.container, "STRETCH COMPLETE").inert);
  },
);
await check(
  "Defaults use prior load, leave reps blank, preserve canonical conversion and clear saved draft",
  async () => {
    const s = start(account());
    const step = {
      ...s.workout.steps[0],
      previous_weight_entries: [
        { amount: "100", unit: "lb", micrograms: "45359237000" },
      ],
    };
    let recorded;
    const m = await view(WorkoutTracer, {
      ...tracerProps(s),
      steps: [step],
      weightUnit: "kg",
      onSave: async (...args) => {
        recorded = args;
        return true;
      },
    });
    assert.equal(m.container.querySelector("#weight-0").value, "45.25");
    assert.equal(m.container.querySelector("#rep-0").value, "");
    for (let i = 0; i < 3; i++)
      await input(m.container, `#rep-${i}`, [8, 3, 2][i]);
    assert.match(
      m.container.querySelector(".rp-total").textContent,
      /13 total reps/,
    );
    await press(m.container, "SAVE & NEXT");
    assert.equal(recorded[1][0].micrograms, "45359237000");
    assert.equal(
      dom.window.localStorage.getItem(
        `dc-workout-draft:${step.workout_id}:${step.ordinal}`,
      ),
      null,
    );
  },
);
await check(
  "Reducer rejects oversized reps and seconds without queueing a performance",
  async () => {
    const s = start(account());
    assert.throws(
      () =>
        save(
          s,
          s.workout.steps[0],
          [{ amount: "100", unit: "lb" }],
          [2147483648, 3, 2],
        ),
      /VALID WEIGHT AND PERFORMANCE/,
    );
  },
);
await check(
  "Escape dismisses cruise suggestion without starting a cruise",
  async () => {
    const state = account();
    state.workout.lifecycle.suggestion_due = true;
    const h = await homeFixture(state);
    assert.match(
      h.container.querySelector("[role=dialog]").textContent,
      /CONSIDER A CRUISE/,
    );
    await act(async () =>
      document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      ),
    );
    assert.equal(h.container.querySelector("[role=dialog]"), null);
    assert.equal(h.state.workout.lifecycle.phase, "blast");
    assert.equal(h.ops.length, 1);
  },
);
await check(
  "Account cleanup removes only the owner's pending workout drafts",
  async () => {
    const { deleteLocalAccountData } = await source("offline-sync.ts");
    const previous = globalThis.localStorage;
    globalThis.localStorage = dom.window.localStorage;
    try {
      localStorage.setItem("dc-workout-draft:cleanup-owner:workout:1", "{}");
      localStorage.setItem("dc-workout-draft:other-owner:workout:1", "{}");
      await deleteLocalAccountData("cleanup-owner");
      assert.equal(
        localStorage.getItem("dc-workout-draft:cleanup-owner:workout:1"),
        null,
      );
      assert.equal(
        localStorage.getItem("dc-workout-draft:other-owner:workout:1"),
        "{}",
      );
    } finally {
      localStorage.removeItem("dc-workout-draft:other-owner:workout:1");
      if (previous === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previous;
    }
  },
);
console.log(
  "UX audit:",
  results.length,
  "checks",
  results.filter((x) => x.status === "PASS").length,
  "passed",
);
assert.deepEqual(
  results.filter((x) => x.status === "FAIL"),
  [],
);
