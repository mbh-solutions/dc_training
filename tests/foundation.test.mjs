import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL &&
      (specifier.endsWith(".js") || specifier.endsWith(".jsx"))
    ) {
      const sourceExtension = specifier.endsWith(".jsx") ? ".tsx" : ".ts";
      const candidate = new URL(
        specifier.replace(/\.jsx?$/, sourceExtension),
        context.parentURL,
      );
      if (existsSync(fileURLToPath(candidate))) {
        return { shortCircuit: true, url: candidate.href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "" };
    }
    if (url.endsWith(".ts") || url.endsWith(".tsx")) {
      const fileName = fileURLToPath(url);
      const source = readFileSync(fileName, "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            inlineSourceMap: true,
            inlineSources: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
          fileName,
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

Object.assign(globalThis, {
  document: { getElementById: () => null },
  window: { location: { hash: "", search: "" } },
});

test("foundation modules load without browser secrets", async () => {
  const [{ default: App }, { isSupabaseConfigured, supabase }] =
    await Promise.all([
      import("../src/main.tsx").then(() => import("../src/App.tsx")),
      import("../src/lib/supabase.ts"),
    ]);

  assert.equal(typeof App, "function");
  assert.equal(isSupabaseConfigured, false);
  assert.equal(supabase, null);
});
