import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";

type SyncState = "idle" | "syncing" | "synced";
export type FoundationProfileState = "pending" | "ready" | "unavailable";
type ProfileResult = {
  state: Exclude<FoundationProfileState, "pending">;
  userId: string;
};

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
          setProfileResult({ state: "unavailable", userId: session.user.id });
          return;
        }

        setProfileResult({ state: "ready", userId: session.user.id });
        setCloudStatus(data.status === "ready" ? "PROTECTED" : "CONNECTED");
        setSyncState("synced");
      });

    return () => {
      active = false;
    };
  }, [online, session]);

  const profileState: FoundationProfileState =
    profileResult && profileResult.userId === session?.user.id
      ? profileResult.state
      : "pending";
  return { cloudStatus, profileState, syncState };
}
