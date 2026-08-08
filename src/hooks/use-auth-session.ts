import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { startedFromPasswordRecovery } from "../lib/auth-callback.js";
import { supabase } from "../lib/supabase.js";

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(
    startedFromPasswordRecovery,
  );

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      setLoadingSession(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const finishPasswordRecovery = useCallback(
    () => setRecoveringPassword(false),
    [],
  );
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  return {
    finishPasswordRecovery,
    loadingSession,
    recoveringPassword,
    session,
    signOut,
  };
}
