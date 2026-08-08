import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  initialAuthErrorCode,
  isSupabaseConfigured,
  startedFromPasswordRecovery,
  supabase,
} from "./lib/supabase.js";

type SyncState = "idle" | "syncing" | "synced" | "failed";

const genericSignInError = "Sign-in failed. Check your email and password.";
const initialAuthMessage =
  initialAuthErrorCode === "otp_expired"
    ? "Reset link expired or was already used. Request a new one."
    : "";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(
    startedFromPasswordRecovery,
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [cloudStatus, setCloudStatus] = useState("NOT CHECKED");

  const refreshCloudStatus = useCallback(async () => {
    if (!supabase || !session || !navigator.onLine) return;

    setSyncState("syncing");
    const { data, error } = await supabase
      .from("foundation_profiles")
      .select("status")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      setCloudStatus("UNAVAILABLE");
      setSyncState("failed");
      return;
    }

    if (!data) {
      await supabase.auth.signOut({ scope: "local" });
      return;
    }

    setCloudStatus(data.status === "ready" ? "PROTECTED" : "CONNECTED");
    setSyncState("synced");
  }, [session]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!supabase) {
      setLoadingSession(false);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
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

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (session && online) void refreshCloudStatus();
  }, [online, refreshCloudStatus, session]);

  if (loadingSession) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!session) return <SignInScreen initialMessage={initialAuthMessage} />;
  if (recoveringPassword) {
    return (
      <ResetPasswordScreen onComplete={() => setRecoveringPassword(false)} />
    );
  }

  const handleSignOut = async () => {
    if (!supabase || !online) return;
    await supabase.auth.signOut();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>DC TRAINING</h1>
        </div>
        <span className="foundation-mark" aria-label="Foundation ready">
          F
        </span>
      </header>

      <NetworkStatus
        online={online}
        syncState={syncState}
        retry={refreshCloudStatus}
      />

      <main>
        <section className="foundation-card" aria-labelledby="foundation-title">
          <p className="section-label">APP FOUNDATION</p>
          <h2 id="foundation-title">READY</h2>
          <p className="foundation-copy">
            Owner-only access, protected cloud data, and offline shell are
            connected.
          </p>

          <dl className="proof-list">
            <div>
              <dt>OWNER ACCOUNT</dt>
              <dd>AUTHENTICATED</dd>
            </div>
            <div>
              <dt>CLOUD RECORD</dt>
              <dd>{cloudStatus}</dd>
            </div>
            <div>
              <dt>PWA SHELL</dt>
              <dd>OFFLINE READY</dd>
            </div>
          </dl>
        </section>

        <p className="account-email">
          SIGNED IN AS {session.user.email?.toUpperCase()}
        </p>
        <button
          className="secondary-action"
          type="button"
          onClick={handleSignOut}
          disabled={!online}
        >
          SIGN OUT
        </button>
        {!online && <p className="quiet-note">CONNECT TO SIGN OUT</p>}
      </main>
    </div>
  );
}

function NetworkStatus({
  online,
  syncState,
  retry,
}: {
  online: boolean;
  syncState: SyncState;
  retry: () => Promise<void>;
}) {
  if (!online)
    return <div className="status-strip">OFFLINE · SAVED ON DEVICE</div>;

  if (syncState === "failed") {
    return (
      <div className="status-strip status-strip--failed">
        <span>SYNC FAILED · SAVED ON DEVICE</span>
        <button type="button" onClick={() => void retry()}>
          TRY AGAIN
        </button>
      </div>
    );
  }

  const label =
    syncState === "syncing"
      ? "SYNCING"
      : syncState === "synced"
        ? "SYNCED"
        : "ONLINE";
  return <div className="status-strip status-strip--quiet">{label}</div>;
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
