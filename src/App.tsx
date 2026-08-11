import {
  AccountStatusErrorScreen,
  DeletionRecoveryScreen,
  LoadingScreen,
  ResetPasswordScreen,
  SetupScreen,
  SignInScreen,
} from "./AuthScreens.jsx";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import FoundationHome from "./FoundationHome.jsx";
import { useAuthSession } from "./hooks/use-auth-session.js";
import { useFoundationProfile } from "./hooks/use-foundation-profile.js";
import { useOnline } from "./hooks/use-online.js";
import { useOwnerAccess } from "./hooks/use-owner-access.js";
import { initialAuthErrorCode } from "./lib/auth-callback.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import {
  cancelOwnerAccountDeletion,
  ownerAccountDeletionStatus,
  type AccountDeletionStatus,
} from "./lib/auth-actions.js";

const initialAuthMessage =
  initialAuthErrorCode === "otp_expired"
    ? "Reset link expired or was already used. Request a new one."
    : "";

function App() {
  const online = useOnline();
  const {
    finishPasswordRecovery,
    loadingSession,
    recoveringPassword,
    session,
    signOut,
  } = useAuthSession();
  const deletion = useAccountDeletion(session, online);
  const activeSession = activeOwnerSession(
    session,
    recoveringPassword,
    deletion.checking,
    deletion.status,
  );
  const { cloudStatus, profileState } = useFoundationProfile(
    activeSession,
    online,
  );
  const profileAccess = useOwnerAccess(activeSession, online, profileState);

  if (loadingSession) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!session) return <SignInScreen initialMessage={initialAuthMessage} />;
  if (recoveringPassword) {
    return <ResetPasswordScreen onComplete={finishPasswordRecovery} />;
  }
  if (deletion.error) {
    return (
      <AccountStatusErrorScreen onRetry={deletion.retry} onSignOut={signOut} />
    );
  }
  if (deletion.checking) return <LoadingScreen />;
  if (deletion.status) {
    return (
      <DeletionRecoveryScreen
        finalizeAt={deletion.status.finalize_at}
        onCancel={deletion.cancel}
        onSignOut={signOut}
      />
    );
  }
  if (profileAccess !== "authorized") {
    return profileAccess === "denied" ? (
      <SignInScreen initialMessage={initialAuthMessage} />
    ) : (
      <LoadingScreen />
    );
  }

  return (
    <FoundationHome
      cloudStatus={cloudStatus}
      email={session.user.email}
      key={session.user.id}
      online={online}
      onSignOut={signOut}
      userId={session.user.id}
    />
  );
}

function activeOwnerSession(
  session: Session | null,
  recoveringPassword: boolean,
  checkingDeletion: boolean,
  deletionStatus: AccountDeletionStatus | null,
) {
  return recoveringPassword || checkingDeletion || deletionStatus
    ? null
    : session;
}

function useAccountDeletion(session: Session | null, online: boolean) {
  const [result, setResult] = useState<{
    status: AccountDeletionStatus | null;
    userId: string;
  } | null>(null);
  const [error, setError] = useState<{
    message: string;
    userId: string;
  } | null>(null);
  const load = useCallback(async () => {
    if (!session || !online) return false;
    setError(null);
    try {
      const status = await ownerAccountDeletionStatus(session.user.id);
      setResult({ status, userId: session.user.id });
      return true;
    } catch {
      setError({
        message: "ACCOUNT STATUS CHECK FAILED · CONNECT AND RETRY",
        userId: session.user.id,
      });
      return false;
    }
  }, [online, session]);

  useEffect(() => {
    if (!session) {
      setResult(null);
      setError(null);
      return;
    }
    if (online) void load();
  }, [load, online, session]);

  useEffect(() => {
    if (!session || !online) return;
    const onForeground = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [load, online, session]);

  const checking = Boolean(
    session && online && result?.userId !== session.user.id,
  );
  return {
    cancel: async () => {
      if (!(await cancelOwnerAccountDeletion())) return false;
      return load();
    },
    checking,
    error: error && error.userId === session?.user.id ? error.message : "",
    retry: load,
    status: result && result.userId === session?.user.id ? result.status : null,
  };
}

export default App;
