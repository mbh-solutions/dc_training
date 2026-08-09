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
import { initialAuthErrorCode } from "./lib/auth-callback.js";
import { isSupabaseConfigured } from "./lib/supabase.js";

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
  const { cloudStatus, profileAccess, syncState } = useFoundationProfile(
    recoveringPassword ? null : session,
    online,
  );

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

  return (
    <FoundationHome
      cloudStatus={cloudStatus}
      email={session.user.email}
      online={online}
      onSignOut={signOut}
      syncState={syncState}
    />
  );
}

export default App;
