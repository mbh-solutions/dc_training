import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/rotation-config.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const config = await import(
  `data:text/javascript,${encodeURIComponent(javascript)}`
);

function sourcePools() {
  const markdown = readFileSync(
    new URL("../docs/research/DC_Garage_Exercise_Pool_V1.md", import.meta.url),
    "utf8",
  );
  const pools = Object.fromEntries(
    markdown
      .split(/^## /m)
      .slice(1)
      .map((section) => {
        const [heading, ...lines] = section.split(/\r?\n/);
        return [
          heading.toLowerCase().replaceAll(" ", "_"),
          lines
            .filter((line) => line.startsWith("- "))
            .map((line) => line.slice(2).trim()),
        ];
      }),
  );
  const corrected = "Wide-stance / sumo belt squat";
  pools.hamstrings = pools.hamstrings.filter((item) => item !== corrected);
  pools.quadriceps.splice(6, 0, corrected);
  return pools;
}

function assertStructure(structure) {
  assert.doesNotMatch(structure.label, /sumo leg press/i);
  if (structure.value === "custom") return;
  assert.ok(structure.targets?.length);
  for (const target of structure.targets)
    assert.ok(target.min > 0 && target.max >= target.min);
}

function assertExercise(position, exercise) {
  for (const protocol of config.protocolChoices(position, exercise)) {
    const structures = config.structureChoices(
      position,
      exercise,
      protocol.value,
    );
    assert.ok(
      config.categoryFor(position) === "abs" ||
        protocol.value === "straight_set" ||
        structures.length > 0,
    );
    structures.forEach(assertStructure);
  }
}

function assertPosition(position) {
  const exercises = config.EXERCISES[config.categoryFor(position)];
  assert.ok(exercises.length > 0);
  assert.ok(exercises.every((exercise) => !exercise.includes("†")));
  for (const exercise of exercises) assertExercise(position, exercise);
}

test("every exercise category and protocol branch matches the locked ledger", () => {
  assert.deepEqual(config.EXERCISES, sourcePools());
  assert.deepEqual(config.positionsFor("A1"), [
    "chest",
    "shoulders",
    "triceps",
    "back_width",
    "back_thickness",
  ]);
  assert.deepEqual(config.positionsFor("B1"), [
    "biceps",
    "forearms",
    "calves",
    "hamstrings",
    "quadriceps",
    "abs_1",
    "abs_2",
  ]);

  for (const slot of config.WORKOUT_SLOTS) {
    config.positionsFor(slot).forEach(assertPosition);
  }

  const values = (position, exercise, protocol) =>
    config
      .structureChoices(position, exercise, protocol)
      .map(({ value }) => value);
  assert.deepEqual(values("triceps", "EZ-bar skullcrusher", "rest_pause"), [
    "11-15",
    "15-30",
    "custom",
  ]);
  assert.deepEqual(
    values("back_thickness", "Conventional deadlift", "straight_set"),
    ["deadlift-6-8-10-12", "custom"],
  );
  assert.deepEqual(
    values("back_thickness", "Landmine T-bar row", "straight_set"),
    ["single-10-12", "custom"],
  );
  assert.deepEqual(
    values("hamstrings", "Lying Deltech leg curl", "rest_pause"),
    ["15-30", "custom"],
  );
  assert.deepEqual(values("hamstrings", "Romanian deadlift", "straight_set"), [
    "single-10-15",
    "custom",
  ]);
  assert.deepEqual(values("quadriceps", "Barbell back squat", "straight_set"), [
    "widowmaker-4-6-20",
    "custom",
  ]);
  assert.deepEqual(values("quadriceps", "Barbell hack squat", "straight_set"), [
    "widowmaker-6-10-20",
    "custom",
  ]);
  assert.deepEqual(values("quadriceps", "Leg extension", "rest_pause"), [
    "custom",
  ]);
  assert.deepEqual(
    config.protocolChoices("abs_1").map(({ value }) => value),
    ["straight_set", "timed_hold"],
  );
  assert.equal(
    config.protocolChoices("hamstrings", "Lying Deltech leg curl")[0].badge,
    "DC",
  );
  assert.equal(
    config.protocolChoices("hamstrings", "Romanian deadlift")[0].badge,
    undefined,
  );
  assert.equal(
    config.protocolChoices("quadriceps", "Leg extension")[1].badge,
    undefined,
  );
  assert.match(
    config.structureChoices(
      "calves",
      "Standing barbell calf raise",
      "straight_set",
    )[0].info,
    /Hold the bottom position for 15 seconds/,
  );
});
