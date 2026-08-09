import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { FoundationProfileState } from "./use-foundation-profile.js";
import { verifyOfflineOwnerSession } from "../lib/offline-owner-session.js";
import { supabase } from "../lib/supabase.js";

type OwnerAccess = "authorized" | "denied" | "pending";

export function useOwnerAccess(
  session: Session | null,
  online: boolean,
  profileState: FoundationProfileState,
) {
  const [offlineAccess, setOfflineAccess] = useState<OwnerAccess>("pending");

  useEffect(() => {
    if (!session || online) {
      setOfflineAccess("pending");
      return;
    }

    let active = true;
    void verifyOfflineOwnerSession(session).then((authorized) => {
      if (active) setOfflineAccess(authorized ? "authorized" : "denied");
    });
    return () => {
      active = false;
    };
  }, [online, session]);

  let profileAccess: OwnerAccess = offlineAccess;
  if (online) {
    if (profileState === "ready") profileAccess = "authorized";
    else if (profileState === "unavailable") profileAccess = "denied";
    else profileAccess = "pending";
  }

  useEffect(() => {
    if (profileAccess === "denied" && supabase) {
      void supabase.auth.signOut({ scope: "local" });
    }
  }, [profileAccess]);

  return profileAccess;
}
