import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/workout-domain.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const domain = await import(
  `data:text/javascript,${encodeURIComponent(javascript)}`
);

test("weights keep exact canonical micrograms and comparison-safe previews", () => {
  assert.equal(
    domain.weightMicrograms({ amount: "1", unit: "lb" }),
    453592370n,
  );
  assert.equal(
    domain.weightMicrograms({ amount: "1", unit: "kg" }),
    1000000000n,
  );
  assert.equal(
    domain.conversionPreview({ amount: "100.5", unit: "lb" }),
    "≈ 45.5 kg",
  );
  assert.equal(
    domain.conversionPreview({ amount: "45.5", unit: "kg" }),
    "≈ 100.5 lb",
  );
  assert.equal(domain.weightMicrograms({ amount: "100.25", unit: "lb" }), null);
  assert.equal(domain.weightMicrograms({ amount: "45.1", unit: "kg" }), null);
});
