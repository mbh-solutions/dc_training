import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const target =
  process.env.SUPPORTABILITY_CHARACTERIZATION_TARGET ?? process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(pathToFileURL(path.join(target, "package.json")));
const definition =
  process.env.SUPPORTABILITY_CHARACTERIZATION_DEFINITION ??
  fileURLToPath(new URL("..", import.meta.url));
const definitionRequire = createRequire(
  pathToFileURL(path.join(definition, "package.json")),
);

const install = (cwd) => {
  const options = { cwd, stdio: "ignore", timeout: 90_000 };
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
};

try {
  require.resolve("typescript");
} catch {
  install(target);
}

try {
  definitionRequire.resolve("jsdom");
} catch {
  install(definition);
}

const ts = require("typescript");
const {
  createClient: createVerificationClient,
} = require("@supabase/supabase-js");
const { JSDOM } = definitionRequire("jsdom");
const calls = [];
const offlineAuthJwks = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "foundation-test-key",
      kty: "EC",
      use: "sig",
      x: "7B1IiuxQLUBKu_UmjGEJrOEfvD4-NHLg9wpU5c4gW0E",
      y: "NTs3pjIiVGEAhx_076fE5DKTIgkJWuB-z5ndfhdmR8g",
    },
  ],
};
const offlineOwnerSubjectSha256 =
  "391887cbcf922e19d672df700739c4a3c74e35ee3d57e7ad97506cd331cd953c";
const offlineAccessToken =
  "eyJhbGciOiJFUzI1NiIsImtpZCI6ImZvdW5kYXRpb24tdGVzdC1rZXkiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3MDAwMDAwMDAsImlzcyI6Imh0dHBzOi8vZXhhbXBsZS5zdXBhYmFzZS5jby9hdXRoL3YxIiwiaXNfYW5vbnltb3VzIjpmYWxzZSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzZXNzaW9uX2lkIjoiZm91bmRhdGlvbi10ZXN0LXNlc3Npb24iLCJzdWIiOiJvd25lci0xIn0.j0an6z1YaPcK1U9h4dJE34hIjL2fR-c7b5Y-H8ncAQKDrsXnuFHW5CKKQ51aC09BZ07TmVYJJQgKoTi7lTsTxw";
const session = {
  access_token: offlineAccessToken,
  user: { email: "owner@example.com", id: "owner-1" },
};
const verificationClient = createVerificationClient(
  "https://example.supabase.co",
  "publishable-test-key",
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);
const sessionResolvers = [];
let authCallback;
let profileResult = { data: { status: "ready" }, error: null };
let assignmentResult = { data: null, error: null };
let updateResult = { error: null };

const client = {
  auth: {
    getClaims: async (token, options) => {
      calls.push(["getClaims", token, options]);
      return verificationClient.auth.getClaims(token, options);
    },
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
      if (options?.scope === "local") {
        queueMicrotask(() => authCallback("SIGNED_OUT", null));
      }
      return { error: null };
    },
    updateUser: async (attributes) => {
      calls.push(["updateUser", attributes]);
      return updateResult;
    },
  },
  from(table) {
    calls.push(["from", table]);
    const query = {
      select(columns) {
        calls.push(["select", columns]);
        return query;
      },
      eq(column, value) {
        calls.push(["eq", column, value]);
        return query;
      },
      async maybeSingle() {
        calls.push(["maybeSingle", table]);
        return table === "foundation_profiles"
          ? profileResult
          : assignmentResult;
      },
      async upsert(values, options) {
        calls.push(["upsert", table, values, options]);
        assignmentResult = { data: values, error: null };
        return { error: null };
      },
    };
    return query;
  },
};

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://dc-training.test/?error_code=otp_expired",
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
    VITE_SUPABASE_AUTH_JWKS: JSON.stringify(offlineAuthJwks),
    VITE_SUPABASE_OWNER_SUB_SHA256: offlineOwnerSubjectSha256,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const { act } = await import(reactUrl);
const root = document.getElementById("root");
const text = () => root.textContent ?? "";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const settleLoading = async () => {
  for (let attempt = 0; attempt < 20 && text().includes("LOADING"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
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

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
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
await act(settleLoading);
const coldOffline = text();
const coldSignOutDisabled = document.querySelector(
  "button.secondary-action",
)?.disabled;
const coldStartNoCloudRead = countCalls("from") === 0;

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const firstOnline = text();
const firstOnlineCloudReads = countCalls("from");

Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
});
await act(settleLoading);
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
const reconnectRefetched = countCalls("from") > firstOnlineCloudReads;

profileResult = { data: null, error: { message: "temporarily unavailable" } };
const localSignOutsBeforeProfileError = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "local",
).length;
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: false,
});
await act(async () => {
  window.dispatchEvent(new window.Event("offline"));
});
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  value: true,
});
await act(async () => {
  window.dispatchEvent(new window.Event("online"));
  await flush();
});
const profileErrorSignedOut =
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "local")
    .length ===
    localSignOutsBeforeProfileError + 1 &&
  text().includes("OWNER ACCESS") &&
  !text().includes("APP FOUNDATION");
const profileErrorHandled =
  profileErrorSignedOut || text().includes("SYNC FAILED · SAVED ON DEVICE");
profileResult = { data: { status: "ready" }, error: null };
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});

await act(async () => {
  document.querySelector("button.secondary-action").click();
  await flush();
});
const signOutSubmitted = hasCall("signOut", (call) => call[1] === undefined);
await act(async () => {
  authCallback("SIGNED_OUT", null);
});
const readsBeforeSignedOut = countCalls("from");
const expiredRecoveryExplained = text().includes(
  "Reset link expired or was already used. Request a new one.",
);

await setInput("email", "owner@example.com");
await setInput("password", "correct-horse-battery-staple");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SIGN IN"))
    .click();
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

const localSignOutsBeforeMissingProfile = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "local",
).length;
profileResult = { data: null, error: null };
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
const missingProfileSignedOut =
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "local")
    .length ===
    localSignOutsBeforeMissingProfile + 1 && text().includes("OWNER ACCESS");
profileResult = { data: { status: "ready" }, error: null };

await act(async () => {
  authCallback("PASSWORD_RECOVERY", session);
});
const recoveryShown = text().includes("OWNER RECOVERY");
await setInput("new-password", "short");
await setInput("confirm-password", "short");
const updatesBeforeShortPassword = countCalls("updateUser");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryShortPasswordRejected =
  text().includes("Use at least 12 characters.") &&
  countCalls("updateUser") === updatesBeforeShortPassword;

await setInput("new-password", "correct-horse-battery-staple");
await setInput("confirm-password", "mismatched-recovery-password");
const updatesBeforeMismatch = countCalls("updateUser");
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryMismatchRejected =
  text().includes("Passwords do not match.") &&
  countCalls("updateUser") === updatesBeforeMismatch;

await setInput("confirm-password", "correct-horse-battery-staple");
updateResult = { error: { message: "recovery session expired" } };
const updatesBeforeFailure = countCalls("updateUser");
const otherSignOutsBeforeFailure = calls.filter(
  (call) => call[0] === "signOut" && call[1]?.scope === "others",
).length;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryFailureRetained =
  text().includes("Password could not be updated. Request a new reset link.") &&
  text().includes("OWNER RECOVERY") &&
  countCalls("updateUser") === updatesBeforeFailure + 1 &&
  calls.filter((call) => call[0] === "signOut" && call[1]?.scope === "others")
    .length === otherSignOutsBeforeFailure;

updateResult = { error: null };
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("SAVE PASSWORD"))
    .click();
  await flush();
});
const recoveryExited =
  text().includes("APP FOUNDATION") && !text().includes("OWNER RECOVERY");
const mountedApplication =
  root.childElementCount > 0 && text().includes("DC TRAINING");

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("ROTATION SETUP"))
    .click();
  await flush();
});
await act(settleLoading);
const emptyA1 =
  text().includes("A1 WORKOUT") && text().includes("CHOOSE EXERCISE");

await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CHOOSE EXERCISE"))
    .click();
});
const exerciseRadios = [...document.querySelectorAll('input[name="exercise"]')];
const approvedChestPool = exerciseRadios.length === 9 && !text().includes("†");
const exerciseContinueDisabled = [...document.querySelectorAll("button")].find(
  (button) => button.textContent.includes("CONTINUE"),
).disabled;
await act(async () => exerciseRadios[0].click());
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});

const protocolInitiallyEmpty =
  document.querySelectorAll('input[name="protocol"]:checked').length === 0 &&
  [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("CONTINUE"),
  ).disabled;
await act(async () =>
  document
    .querySelector('button[aria-label="Chest protocol information"]')
    .click(),
);
const protocolGuidance = text().includes(
  "Classic DC uses one rest-pause work set.",
);
await act(async () =>
  document.querySelector('input[value="rest_pause"]').click(),
);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});

const rangeInitiallyEmpty =
  document.querySelectorAll('input[name="range"]:checked').length === 0 &&
  [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("CONTINUE"),
  ).disabled;
await act(async () => document.querySelector('input[value="11-15"]').click());
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});
const reviewComplete =
  text().includes("REVIEW ASSIGNMENT") &&
  text().includes("Incline barbell press") &&
  text().includes("REST-PAUSE") &&
  text().includes("11–15");

await act(async () => document.querySelector("button.back-action").click());
const backPreserved = document.querySelector('input[value="11-15"]').checked;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("CONTINUE"))
    .click();
});
const upsertsBeforeSave = calls.filter((call) => call[0] === "upsert").length;
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "SAVE")
    .click();
  await flush();
});
const savedExactlyOnce =
  calls.filter((call) => call[0] === "upsert").length ===
    upsertsBeforeSave + 1 && text().includes("Incline barbell press");

await act(async () => authCallback("SIGNED_OUT", null));
await act(async () => {
  authCallback("SIGNED_IN", session);
  await flush();
});
await act(settleLoading);
await act(async () => {
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("ROTATION SETUP"))
    .click();
  await flush();
});
await act(settleLoading);
const restoredAfterRemount =
  text().includes("A1 WORKOUT") &&
  text().includes("Incline barbell press") &&
  text().includes("11–15");

const behavior = {
  a1_assignment_round_trip:
    emptyA1 &&
    approvedChestPool &&
    exerciseContinueDisabled &&
    protocolInitiallyEmpty &&
    protocolGuidance &&
    rangeInitiallyEmpty &&
    reviewComplete &&
    backPreserved &&
    savedExactlyOnce &&
    restoredAfterRemount,
  browser_safe_client:
    hasCall(
      "createClient",
      (call) =>
        call[1] === "https://example.supabase.co" &&
        call[2] === "publishable-test-key" &&
        call[3]?.autoRefreshToken === true &&
        call[3]?.detectSessionInUrl === true &&
        call[3]?.persistSession === true,
    ) && !JSON.stringify(calls).includes("service_role"),
  cold_start_offline:
    coldStartNoCloudRead &&
    coldOffline.includes("OFFLINE · SAVED ON DEVICE") &&
    coldSignOutDisabled === true,
  expired_recovery_explained: expiredRecoveryExplained,
  generic_sign_in_error: genericSignInError,
  mounted_application: mountedApplication,
  missing_profile_signed_out: missingProfileSignedOut,
  offline_sign_out_safe:
    offline.includes("OFFLINE · SAVED ON DEVICE") && signOutDisabled === true,
  protected_owner_record:
    hasCall("from", (call) => call[1] === "foundation_profiles") &&
    hasCall("select", (call) => call[1] === "status") &&
    hasCall("eq", (call) => call[1] === "user_id" && call[2] === "owner-1") &&
    signedOutReadBlocked,
  rotation_assignment_boundary:
    hasCall("from", (call) => call[1] === "rotation_assignments") &&
    hasCall(
      "upsert",
      (call) =>
        call[1] === "rotation_assignments" &&
        call[2]?.user_id === "owner-1" &&
        call[2]?.slot === "A1" &&
        call[2]?.body_part === "chest" &&
        call[2]?.protocol === "rest_pause" &&
        call[2]?.target_min === 11 &&
        call[2]?.target_max === 15 &&
        call[3]?.onConflict === "user_id,slot",
    ),
  recovery_failure_retained: recoveryFailureRetained,
  recovery_rejects_mismatch: recoveryMismatchRejected,
  recovery_rejects_short_password: recoveryShortPasswordRejected,
  recovery_completed:
    recoveryShown &&
    recoveryExited &&
    hasCall(
      "updateUser",
      (call) => call[1]?.password === "correct-horse-battery-staple",
    ) &&
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
    coldOffline.includes("AUTHENTICATED") &&
    firstOnline.includes("PROTECTED"),
  sign_in_submitted: hasCall(
    "signInWithPassword",
    (call) =>
      call[1]?.email === "owner@example.com" &&
      call[1]?.password === "correct-horse-battery-staple",
  ),
  sign_out_submitted: signOutSubmitted,
  profile_error_handled: profileErrorHandled,
  reconnect_refetched: reconnectRefetched && reconnected.includes("SYNCED"),
};

process.stdout.write(
  JSON.stringify({
    behavior,
    scenario: "foundation-shell",
    schema_version: "1.0",
  }),
);
