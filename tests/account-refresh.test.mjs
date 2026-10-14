import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  source,
  mount,
  act,
  account,
  offlineView,
} from "./behavior-runtime.mjs";
const session = { user: { id: "owner", email: "owner@example.com" } };
globalThis.__accountTest = { session, fail: false, requests: 0 };
const replacements = {
  "supabase.js": "export const isSupabaseConfigured=true;",
  "use-auth-session.js":
    "export const useAuthSession=()=>({session:globalThis.__accountTest.session,loadingSession:false,recoveringPassword:false,signOut:async()=>{}});",
  "use-foundation-profile.js":
    'export const useFoundationProfile=()=>({cloudStatus:"ready",profileState:"ready"});',
  "use-owner-access.js": 'export const useOwnerAccess=()=>"authorized";',
  "auth-actions.js":
    'export async function ownerAccountDeletionStatus(){globalThis.__accountTest.requests++;if(globalThis.__accountTest.fail) throw new Error("offline");return null;} export const cancelOwnerAccountDeletion=async()=>true; export const requestOwnerAccountDeletion=async()=>null;',
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const replacement = replacements[specifier.split("/").at(-1)];
    if (replacement && context.parentURL.endsWith("/App.tsx"))
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(replacement)}`,
      };
    return nextResolve(specifier, context);
  },
});
const { default: App } = await source("App.tsx");
test("account status refresh checks on foreground and recovers after failure", async () => {
  globalThis.__testOffline = offlineView(account(), async () => ({
    data: null,
    error: "not used",
  }));
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const view = await mount(App, {});
  assert.ok(globalThis.__accountTest.requests >= 1);
  const before = globalThis.__accountTest.requests;
  await act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.equal(globalThis.__accountTest.requests, before + 1);
  globalThis.__accountTest.fail = true;
  await act(async () =>
    document.dispatchEvent(new window.Event("visibilitychange")),
  );
  assert.equal(globalThis.__accountTest.requests, before + 2);
  assert.match(view.container.textContent, /ACCOUNT STATUS UNAVAILABLE/);
  globalThis.__accountTest.fail = false;
  await act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.equal(globalThis.__accountTest.requests, before + 3);
  await view.close();
  await act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.equal(globalThis.__accountTest.requests, before + 3);
});
