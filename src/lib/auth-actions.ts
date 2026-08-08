import { supabase } from "./supabase.js";

export async function signInOwner(email: string, password: string) {
  if (!supabase) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function requestOwnerPasswordReset(email: string) {
  if (!supabase) return;
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account/update-password`,
  });
}

export async function completeOwnerPasswordRecovery(password: string) {
  if (!supabase) return false;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return false;
  await supabase.auth.signOut({ scope: "others" });
  return true;
}
