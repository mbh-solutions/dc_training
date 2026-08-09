import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";

const profileAuthorizationKey = "dc-training.foundation-profile-user-id";

type SyncState = "idle" | "syncing" | "synced";
type ProfileAccess = "authorized" | "denied";
type ProfileResult = { state: ProfileAccess; userId: string };

export function useFoundationProfile(session: Session | null, online: boolean) {
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(
    null,
  );
  const [cloudStatus, setCloudStatus] = useState("NOT CHECKED");
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    if (!session) {
      setProfileResult(null);
      setCloudStatus("NOT CHECKED");
      setSyncState("idle");
      return;
    }
    if (!online || !supabase) return;

    const client = supabase;
    let active = true;
    setSyncState("syncing");
    void client
      .from("foundation_profiles")
      .select("status")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setProfileResult({ state: "denied", userId: session.user.id });
          window.localStorage.removeItem(profileAuthorizationKey);
          await client.auth.signOut({ scope: "local" });
          return;
        }

        window.localStorage.setItem(profileAuthorizationKey, session.user.id);
        setProfileResult({ state: "authorized", userId: session.user.id });
        setCloudStatus(data.status === "ready" ? "PROTECTED" : "CONNECTED");
        setSyncState("synced");
      });

    return () => {
      active = false;
    };
  }, [online, session]);

  const profileAccess: ProfileAccess | "pending" =
    profileResult && profileResult.userId === session?.user.id
      ? profileResult.state
      : !online &&
          window.localStorage.getItem(profileAuthorizationKey) ===
            session?.user.id
        ? "authorized"
      : "pending";
  return { cloudStatus, profileAccess, syncState };
}
