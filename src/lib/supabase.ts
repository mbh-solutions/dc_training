import { createClient } from "@supabase/supabase-js";

const environment = (
  import.meta as ImportMeta & {
    readonly env?: Record<string, string | undefined>;
  }
).env;
const supabaseUrl = environment?.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey =
  environment?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialSearch = new URLSearchParams(window.location.search);

export const startedFromPasswordRecovery =
  initialHash.get("type") === "recovery" ||
  initialSearch.get("type") === "recovery";

export const initialAuthErrorCode =
  initialHash.get("error_code") || initialSearch.get("error_code");

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
