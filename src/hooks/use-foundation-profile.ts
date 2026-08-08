import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";

type SyncState = "idle" | "syncing" | "synced";

export function useFoundationProfile(session: Session | null, online: boolean) {
  const [accessDenied, setAccessDenied] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("NOT CHECKED");
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    if (!session) {
      setAccessDenied(false);
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
          setAccessDenied(true);
          await client.auth.signOut({ scope: "local" });
          return;
        }

        setAccessDenied(false);
        setCloudStatus(data.status === "ready" ? "PROTECTED" : "CONNECTED");
        setSyncState("synced");
      });

    return () => {
      active = false;
    };
  }, [online, session]);

  return { accessDenied, cloudStatus, syncState };
}
