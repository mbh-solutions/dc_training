import { createClient } from "@supabase/supabase-js";

const environment = (
  import.meta as ImportMeta & {
    readonly env?: Record<string, string | undefined>;
  }
).env;
export const supabaseUrl = environment?.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey =
  environment?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const supabaseAuthJwks = environment?.VITE_SUPABASE_AUTH_JWKS?.trim();
export const supabaseOwnerSubjectSha256 =
  environment?.VITE_SUPABASE_OWNER_SUB_SHA256?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  supabaseAuthJwks &&
  supabaseOwnerSubjectSha256,
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
