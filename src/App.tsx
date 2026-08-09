import {
  LoadingScreen,
  ResetPasswordScreen,
  SetupScreen,
  SignInScreen,
} from "./AuthScreens.jsx";
import FoundationHome from "./FoundationHome.jsx";
import { useAuthSession } from "./hooks/use-auth-session.js";
import { useFoundationProfile } from "./hooks/use-foundation-profile.js";
import { useOnline } from "./hooks/use-online.js";
import { useOwnerAccess } from "./hooks/use-owner-access.js";
import { initialAuthErrorCode } from "./lib/auth-callback.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import { useState } from "react";
import RotationSetup from "./RotationSetup.jsx";

const initialAuthMessage =
  initialAuthErrorCode === "otp_expired"
    ? "Reset link expired or was already used. Request a new one."
    : "";

function App() {
  const [showRotationSetup, setShowRotationSetup] = useState(false);
  const online = useOnline();
  const {
    finishPasswordRecovery,
    loadingSession,
    recoveringPassword,
    session,
    signOut,
  } = useAuthSession();
  const activeSession = recoveringPassword ? null : session;
  const { cloudStatus, profileState, syncState } = useFoundationProfile(
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
  if (profileAccess !== "authorized") {
    return profileAccess === "denied" ? (
      <SignInScreen initialMessage={initialAuthMessage} />
    ) : (
      <LoadingScreen />
    );
  }

  if (showRotationSetup) {
    return (
      <RotationSetup
        onBack={() => setShowRotationSetup(false)}
        userId={session.user.id}
      />
    );
  }

  return (
    <FoundationHome
      cloudStatus={cloudStatus}
      email={session.user.email}
      online={online}
      onOpenRotationSetup={() => setShowRotationSetup(true)}
      onSignOut={signOut}
      syncState={syncState}
    />
  );
}

export default App;
