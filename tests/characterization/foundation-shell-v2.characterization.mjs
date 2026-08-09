import path from "node:path";
import { pathToFileURL } from "node:url";

const write = process.stdout.write.bind(process.stdout);
let captured = "";

process.stdout.write = (chunk) => {
  captured += String(chunk);
  return true;
};

try {
  const definition =
    process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ?? process.cwd();
  await import(
    pathToFileURL(
      path.join(
        definition,
        "tests/characterization/foundation-shell.characterization.mjs",
      ),
    ).href
  );
} finally {
  process.stdout.write = write;
}

const result = JSON.parse(captured);
result.scenario = "foundation-shell-v2";
write(JSON.stringify(result));
