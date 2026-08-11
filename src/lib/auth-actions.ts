import { supabase } from "./supabase.js";
import {
  deleteLocalAccountData,
  editingDeviceId,
  isCloudOwnerId,
} from "../offline-sync.js";

export type AccountDeletionStatus = {
  cleanupFailed?: boolean;
  finalize_at: string;
  requested_at: string;
};

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

export async function ownerAccountDeletionStatus(userId: string) {
  if (!isCloudOwnerId(userId)) return null;
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("account_deletion_status");
  if (error) throw new Error(error.message);
  if (!validDeletionStatus(data)) return null;
  return { ...data, cleanupFailed: !(await purgeLocalAccountData(userId)) };
}

export async function requestOwnerAccountDeletion(
  email: string,
  password: string,
  userId: string,
) {
  if (!supabase) return false;
  const { data: authentication, error: authenticationError } =
    await supabase.auth.signInWithPassword({ email, password });
  if (authenticationError || authentication.user?.id !== userId) return false;
  const { error } = await supabase.rpc("request_account_deletion", {
    p_device_id: editingDeviceId(),
  });
  if (error) return false;
  const purged = await purgeLocalAccountData(userId);
  return (await signOutOwner()) && purged;
}

export async function cancelOwnerAccountDeletion() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  return !error && data === true;
}

function validDeletionStatus(value: unknown): value is AccountDeletionStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<AccountDeletionStatus>;
  return (
    typeof status.requested_at === "string" &&
    typeof status.finalize_at === "string"
  );
}

async function purgeLocalAccountData(userId: string) {
  try {
    await deleteLocalAccountData(userId);
    return true;
  } catch {
    return false;
  }
}

export async function signOutOwner() {
  if (!supabase) return false;
  const { error } = await supabase.auth.signOut();
  if (!error) return true;
  const { error: localError } = await supabase.auth.signOut({ scope: "local" });
  return !localError;
}
