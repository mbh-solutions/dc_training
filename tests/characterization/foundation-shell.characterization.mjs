import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

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
const sessionResolvers = [];
let authCallback;

const client = {
  auth: {
    getSession: () => {
      calls.push(["getSession"]);
      return new Promise((resolve) => sessionResolvers.push(resolve));
    },
    onAuthStateChange: (callback) => {
      calls.push(["onAuthStateChange"]);
      authCallback = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    resetPasswordForEmail: async (email, options) => {
      calls.push(["resetPasswordForEmail", email, options]);
      return { error: null };
    },
    signInWithPassword: async (credentials) => {
      calls.push(["signInWithPassword", credentials]);
      return { error: { message: "User not found" } };
    },
    signOut: async (options) => {
      calls.push(["signOut", options]);
      return { error: null };
    },
    updateUser: async (attributes) => {
      calls.push(["updateUser", attributes]);
      return { error: null };
    },
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

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://dc-training.test/",
});
Object.assign(globalThis, {
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  MouseEvent: dom.window.MouseEvent,
  Node: dom.window.Node,
  window: dom.window,
  __foundationCalls: calls,
  __foundationClient: client,
  __foundationEnv: {
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    VITE_SUPABASE_URL: "https://example.supabase.co",
  },
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const moduleUrl = (source) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const supabaseUrl = moduleUrl(`
export const createClient = (url, key, options) => {
  globalThis.__foundationCalls.push(["createClient", url, key, options.auth]);
  return globalThis.__foundationClient;
};
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@supabase/supabase-js") {
      return { shortCircuit: true, url: supabaseUrl };
    }

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const { act } = await import(reactUrl);
const root = document.getElementById("root");
const text = () => root.textContent ?? "";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const hasCall = (name, predicate = () => true) =>
  calls.some((call) => call[0] === name && predicate(call));
const countCalls = (name) => calls.filter((call) => call[0] === name).length;

const setInput = async (id, value) => {
  const input = document.getElementById(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await flush();
  });
};

await act(async () => {
  await import(pathToFileURL(path.join(target, "src/main.tsx")).href);
});
const loading = text().includes("LOADING");

await act(async () => {
  for (const resolve of sessionResolvers.splice(0)) {
    resolve({ data: { session } });
  }
  await flush();
});
const signedIn = text();
const firstCloudReads = countCalls("from");

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
});
const offline = text();
const signOutDisabled = document.querySelector(
  "button.secondary-action",
)?.disabled;

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const reconnected = text();
const reconnectRefetched = countCalls("from") > firstCloudReads;

await act(async () => {
  document.querySelector("button.secondary-action").click();
  await flush();
  authCallback("SIGNED_OUT", null);
});
const readsBeforeSignedOut = countCalls("from");

await setInput("email", "owner@example.com");
await setInput("password", "correct-horse-battery-staple");
await act(async () => {
  document
    .querySelector("form.auth-form")
    .dispatchEvent(new window.SubmitEvent("submit", { bubbles: true }));
  await flush();
});
const genericSignInError = text().includes(
  "Sign-in failed. Check your email and password.",
);

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("FORGOT PASSWORD?"))
    .click();
  await flush();
});
const resetMessage = text().includes(
  "If this account exists, a reset link is on its way.",
);
const signedOutReadBlocked = countCalls("from") === readsBeforeSignedOut;

await act(async () => {
  authCallback("PASSWORD_RECOVERY", session);
});
const recoveryShown = text().includes("OWNER RECOVERY");
await setInput("new-password", "correct-horse-battery-staple");
await setInput("confirm-password", "correct-horse-battery-staple");
await act(async () => {
  document
    .querySelector("form.auth-form")
    .dispatchEvent(new window.SubmitEvent("submit", { bubbles: true }));
  await flush();
});
const recoveryExited =
  text().includes("APP FOUNDATION") && !text().includes("OWNER RECOVERY");

const behavior = {
  browser_safe_client:
    hasCall(
      "createClient",
      (call) =>
        call[1] === "https://example.supabase.co" &&
        call[2] === "publishable-test-key",
    ) && !JSON.stringify(calls).includes("service_role"),
  generic_sign_in_error: genericSignInError,
  mounted_application:
    root.childElementCount > 0 && text().includes("DC TRAINING"),
  offline_sign_out_safe:
    offline.includes("OFFLINE · SAVED ON DEVICE") && signOutDisabled === true,
  protected_owner_record:
    hasCall("from", (call) => call[1] === "foundation_profiles") &&
    hasCall("eq", (call) => call[1] === "user_id" && call[2] === "owner-1") &&
    signedOutReadBlocked,
  recovery_completed:
    recoveryShown &&
    recoveryExited &&
    hasCall("updateUser") &&
    hasCall("signOut", (call) => call[1]?.scope === "others") &&
    window.location.pathname === "/",
  reset_request_private:
    resetMessage &&
    hasCall(
      "resetPasswordForEmail",
      (call) =>
        call[1] === "owner@example.com" &&
        call[2]?.redirectTo ===
          "https://dc-training.test/account/update-password",
    ),
  session_restored:
    loading &&
    signedIn.includes("AUTHENTICATED") &&
    signedIn.includes("PROTECTED"),
  sign_in_submitted: hasCall(
    "signInWithPassword",
    (call) =>
      call[1]?.email === "owner@example.com" &&
      call[1]?.password === "correct-horse-battery-staple",
  ),
  reconnect_refetched: reconnectRefetched && reconnected.includes("SYNCED"),
};

process.stdout.write(
  JSON.stringify({
    behavior,
    scenario: "foundation-shell",
    schema_version: "1.0",
  }),
);
