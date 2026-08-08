import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const supabase = readFileSync("src/lib/supabase.ts", "utf8");

const behavior = {
  account_required: app.includes("ACCOUNT REQUIRED · NO GUEST ACCESS"),
  cloud_record: app.includes("foundation_profiles"),
  offline_status: app.includes("OFFLINE · SAVED ON DEVICE"),
  owner_password_auth: app.includes("signInWithPassword"),
  password_recovery: app.includes("resetPasswordForEmail"),
  react_root: main.includes("createRoot") && main.includes("<App />"),
  supabase_client: supabase.includes("createClient"),
};

process.stdout.write(
  JSON.stringify({
    behavior,
    scenario: "foundation-shell",
    schema_version: "1.0",
  }),
);
