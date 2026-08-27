import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const relativeCanary = "src/components/s09-gate7-canary.ts";
const targetCanary = path.join(target, relativeCanary);
const hasCanary = existsSync(targetCanary);
const canary = await import(
  pathToFileURL(
    hasCanary
      ? targetCanary
      : path.join(target, "src/rotation-config.ts"),
  ).href
);

process.stdout.write(
  JSON.stringify({
    behavior: {
      quality_canary: hasCanary
        ? canary.S09_GATE7_CANARY
        : canary.WORKOUT_SLOTS[0],
    },
    scenario: "s09-gate7-canary",
    schema_version: "1.0",
  }),
);
