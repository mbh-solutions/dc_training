import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const definition =
  process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ?? process.cwd();
const relativeCanary = existsSync(
  path.join(target, "src/components/s09-gate7-canary.ts"),
)
  ? "src/components/s09-gate7-canary.ts"
  : "legacy/s09-gate7-canary.ts";
const targetCanary = path.join(target, relativeCanary);
const canary = await import(
  pathToFileURL(
    existsSync(targetCanary)
      ? targetCanary
      : path.join(definition, relativeCanary),
  ).href
);

process.stdout.write(
  JSON.stringify({
    behavior: {
      quality_canary: canary.S09_GATE7_CANARY,
    },
    scenario: "s09-gate7-canary",
    schema_version: "1.0",
  }),
);
