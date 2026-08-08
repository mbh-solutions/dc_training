import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(pathToFileURL(path.join(target, "package.json")));

try {
  require.resolve("typescript");
} catch {
  const options = { cwd: target, stdio: "ignore", timeout: 90_000 };
  if (process.platform === "win32") {
    execFileSync(
      process.env.ComSpec,
      ["/d", "/s", "/c", "npm ci --ignore-scripts --no-audit --no-fund"],
      options,
    );
  } else {
    execFileSync(
      npm,
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      options,
    );
  }
}

const ts = require("typescript");
const calls = [];
const session = { user: { email: "owner@example.com", id: "owner-1" } };

const client = {
  auth: {
    getSession: async () => {
      calls.push(["getSession"]);
      return { data: { session } };
    },
    onAuthStateChange: () => {
      calls.push(["onAuthStateChange"]);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signOut: async () => ({ error: null }),
  },
  from(table) {
    calls.push(["from", table]);
    return {
      select(columns) {
        calls.push(["select", columns]);
        return {
          eq(column, value) {
            calls.push(["eq", column, value]);
            return {
              async maybeSingle() {
                calls.push(["maybeSingle"]);
                return { data: { status: "ready" }, error: null };
              },
            };
          },
        };
      },
    };
  },
};

Object.assign(globalThis, {
  __foundationCalls: calls,
  __foundationClient: client,
  __foundationEffects: [],
  __foundationEnv: {
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    VITE_SUPABASE_URL: "https://example.supabase.co",
  },
  __foundationMounts: [],
  __foundationStates: [],
});

Object.defineProperties(globalThis, {
  document: {
    configurable: true,
    value: { getElementById: (id) => ({ id }) },
  },
  navigator: {
    configurable: true,
    value: { onLine: true },
  },
  window: {
    configurable: true,
    value: {
      addEventListener() {},
      history: { replaceState() {} },
      location: { hash: "", origin: "https://dc-training.test", search: "" },
      removeEventListener() {},
    },
  },
});

const moduleUrl = (source) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const reactUrl = moduleUrl(`
export const useCallback = (callback) => callback;
export const useEffect = (effect) => globalThis.__foundationEffects.push(effect);
export const useState = (initial) => {
  const states = globalThis.__foundationStates;
  const value = states.length ? states.shift() : initial;
  return [value, () => {}];
};
export const StrictMode = Symbol.for("StrictMode");
`);
const jsxUrl = moduleUrl(`
const render = (type, props) => typeof type === "function" ? type(props ?? {}) : { type, props: props ?? {} };
export const Fragment = Symbol.for("Fragment");
export const jsx = render;
export const jsxs = render;
`);
const reactDomUrl = moduleUrl(`
export const createRoot = (root) => ({ render(node) { globalThis.__foundationMounts.push([root.id, node]); } });
`);
const supabaseUrl = moduleUrl(`
export const createClient = (url, key, options) => {
  globalThis.__foundationCalls.push(["createClient", url, key, options.auth]);
  return globalThis.__foundationClient;
};
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@supabase/supabase-js": supabaseUrl,
      react: reactUrl,
      "react-dom/client": reactDomUrl,
      "react/jsx-runtime": jsxUrl,
    };
    if (mocks[specifier]) return { shortCircuit: true, url: mocks[specifier] };

    if (context.parentURL?.startsWith("file:") && specifier.startsWith(".")) {
      const requested = new URL(specifier, context.parentURL);
      const candidates = [requested];
      if (specifier.endsWith(".js")) {
        candidates.push(
          new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL),
        );
      } else if (specifier.endsWith(".jsx")) {
        candidates.push(
          new URL(specifier.replace(/\.jsx$/, ".tsx"), context.parentURL),
        );
      } else if (!path.extname(specifier)) {
        candidates.push(new URL(`${specifier}.ts`, context.parentURL));
        candidates.push(new URL(`${specifier}.tsx`, context.parentURL));
      }
      const match = candidates.find((candidate) =>
        existsSync(fileURLToPath(candidate)),
      );
      if (match) return { shortCircuit: true, url: match.href };
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
        source: ts
          .transpileModule(source, {
            compilerOptions: {
              inlineSourceMap: true,
              inlineSources: true,
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
            fileName,
          })
          .outputText.replaceAll(
            "import.meta.env",
            "globalThis.__foundationEnv",
          ),
      };
    }
    return nextLoad(url, context);
  },
});

const text = (node) => {
  if (node == null || node === false) return [];
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap(text);
  return text(node.props?.children);
};

const appUrl = pathToFileURL(path.join(target, "src/App.tsx")).href;
const mainUrl = pathToFileURL(path.join(target, "src/main.tsx")).href;
const { default: App } = await import(appUrl);

globalThis.__foundationStates.push(
  session,
  false,
  false,
  true,
  "synced",
  "PROTECTED",
);
const online = text(App());
for (const effect of globalThis.__foundationEffects.splice(0)) effect();
await new Promise((resolve) => setImmediate(resolve));

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: false },
});
globalThis.__foundationStates.push(
  session,
  false,
  false,
  false,
  "idle",
  "PROTECTED",
);
const offline = text(App());

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: true },
});
globalThis.__foundationStates.push(
  null,
  false,
  false,
  true,
  "idle",
  "NOT CHECKED",
);
const signedOut = text(App());
globalThis.__foundationStates.push(
  session,
  false,
  true,
  true,
  "idle",
  "NOT CHECKED",
);
const recovery = text(App());

await import(mainUrl);

const includes = (values, expected) =>
  expected.every((value) => values.includes(value));
const behavior = {
  cloud_calls: calls,
  mounted_root: globalThis.__foundationMounts[0]?.[0] ?? null,
  offline_ui: includes(offline, [
    "OFFLINE · SAVED ON DEVICE",
    "CONNECT TO SIGN OUT",
  ]),
  online_ui: includes(online, [
    "READY",
    "AUTHENTICATED",
    "PROTECTED",
    "OFFLINE READY",
  ]),
  recovery_ui: includes(recovery, [
    "NEW PASSWORD",
    "OWNER RECOVERY",
    "SAVE PASSWORD",
  ]),
  signed_out_ui: includes(signedOut, [
    "OWNER ACCESS",
    "SIGN IN",
    "FORGOT PASSWORD?",
    "ACCOUNT REQUIRED · NO GUEST ACCESS",
  ]),
};

process.stdout.write(
  JSON.stringify({
    behavior,
    scenario: "foundation-shell",
    schema_version: "1.0",
  }),
);
