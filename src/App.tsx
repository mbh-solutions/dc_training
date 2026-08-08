import { useState, type FormEvent } from "react";
import FoundationHome from "./FoundationHome.jsx";
import { useAuthSession } from "./hooks/use-auth-session.js";
import { useFoundationProfile } from "./hooks/use-foundation-profile.js";
import { useOnline } from "./hooks/use-online.js";
import { initialAuthErrorCode } from "./lib/auth-callback.js";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const genericSignInError = "Sign-in failed. Check your email and password.";
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
  const { accessDenied, cloudStatus, syncState } = useFoundationProfile(
    recoveringPassword ? null : session,
    online,
  );

  if (loadingSession) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!session || accessDenied)
    return <SignInScreen initialMessage={initialAuthMessage} />;
  if (recoveringPassword) {
    return <ResetPasswordScreen onComplete={finishPasswordRecovery} />;
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

function SignInScreen({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || submitting) return;

    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setMessage(genericSignInError);
    setSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!supabase || !email.trim()) {
      setMessage("Enter your email first.");
      return;
    }

    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/account/update-password`,
    });
    setMessage("If this account exists, a reset link is on its way.");
    setSubmitting(false);
  };

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>DC TRAINING</h1>
          <p>OWNER ACCESS</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">EMAIL</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">PASSWORD</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}

          <button
            className="primary-action"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "WORKING…" : "SIGN IN"}
          </button>
          <button
            className="text-action"
            type="button"
            onClick={handlePasswordReset}
            disabled={submitting}
          >
            FORGOT PASSWORD?
          </button>
        </form>

        <p className="auth-footnote">ACCOUNT REQUIRED · NO GUEST ACCESS</p>
      </div>
    </div>
  );
}

function ResetPasswordScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || submitting) return;

    if (password.length < 12) {
      setMessage("Use at least 12 characters.");
      return;
    }

    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage("Password could not be updated. Request a new reset link.");
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut({ scope: "others" });
    window.history.replaceState({}, "", "/");
    onComplete();
  };

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>NEW PASSWORD</h1>
          <p>OWNER RECOVERY</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="new-password">NEW PASSWORD</label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <label htmlFor="confirm-password">CONFIRM PASSWORD</label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />

          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}

          <button
            className="primary-action"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "SAVING…" : "SAVE PASSWORD"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="center-screen" role="status">
      <span className="loading-mark">DC</span>
      <p>LOADING</p>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="center-screen">
      <span className="loading-mark">DC</span>
      <h1>SETUP REQUIRED</h1>
      <p>Cloud connection is not configured.</p>
    </div>
  );
}

export default App;
