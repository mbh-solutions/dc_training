import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { FoundationProfileState } from "./use-foundation-profile.js";
import { verifyOfflineOwnerSession } from "../lib/offline-owner-session.js";
import { hasOfflineState } from "../offline-sync.js";
import { supabase } from "../lib/supabase.js";

type OwnerAccess = "authorized" | "denied" | "pending";

export function useOwnerAccess(
  session: Session | null,
  online: boolean,
  profileState: FoundationProfileState,
) {
  const [cachedAccess, setCachedAccess] = useState<OwnerAccess>("pending");

  useEffect(() => {
    if (!session || (online && profileState === "ready")) {
      setCachedAccess("pending");
      return;
    }

    let active = true;
    void Promise.all([
      verifyOfflineOwnerSession(session),
      hasOfflineState(session.user.id),
    ])
      .then(([ownerVerified, stateAvailable]) => {
        if (active)
          setCachedAccess(
            ownerVerified && stateAvailable ? "authorized" : "denied",
          );
      })
      .catch(() => {
        if (active) setCachedAccess("denied");
      });
    return () => {
      active = false;
    };
  }, [online, profileState, session]);

  let profileAccess: OwnerAccess = cachedAccess;
  if (online) {
    if (profileState === "ready") profileAccess = "authorized";
    else if (profileState === "pending") profileAccess = "pending";
  }

  useEffect(() => {
    if (profileAccess === "denied" && supabase) {
      void supabase.auth.signOut({ scope: "local" });
    }
  }, [profileAccess]);

  return profileAccess;
}
