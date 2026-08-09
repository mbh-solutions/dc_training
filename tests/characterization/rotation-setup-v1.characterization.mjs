import path from "node:path";
import { pathToFileURL } from "node:url";

const write = process.stdout.write.bind(process.stdout);
let captured = "";

process.stdout.write = (chunk) => {
  captured += String(chunk);
  return true;
};

try {
  const target =
    process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
  await import(
    pathToFileURL(path.join(target, "tests/a1-assignment.e2e.mjs")).href
  );
} finally {
  process.stdout.write = write;
}

const result = JSON.parse(captured);
write(
  JSON.stringify({
    behavior: {
      a1_assignment_round_trip: result.behavior.a1_assignment_round_trip,
    },
    scenario: "rotation-setup-v1",
    schema_version: "1.0",
  }),
);
