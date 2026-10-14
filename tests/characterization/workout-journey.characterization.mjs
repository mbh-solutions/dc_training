import path from "node:path";
import { pathToFileURL } from "node:url";
const definition =
  process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ?? process.cwd();
const { workflowCase } = await import(
  pathToFileURL(path.join(definition, "tests/behavior-workflow.mjs")).href
);
const cases = [];
for (const input of [
  { slot: "A1", amount: "80", reps: [8, 3, 2] },
  { slot: "A2", amount: "100", reps: [10, 3, 2] },
])
  cases.push({
    input,
    output: await workflowCase(input.slot, input.amount, input.reps),
  });
process.stdout.write(
  JSON.stringify({
    schema_version: "1.0",
    scenario: "workout-journey",
    behavior: { journey: cases },
  }),
);
