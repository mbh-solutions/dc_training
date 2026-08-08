import { useState, type FormEvent } from "react";
import {
  completeOwnerPasswordRecovery,
  requestOwnerPasswordReset,
  signInOwner,
} from "./lib/auth-actions.js";

const genericSignInError = "Sign-in failed. Check your email and password.";

export function SignInScreen({
  initialMessage = "",
}: {
  initialMessage?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage("");
    if (!(await signInOwner(email, password))) setMessage(genericSignInError);
    setSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setMessage("Enter your email first.");
      return;
    }

    setSubmitting(true);
    await requestOwnerPasswordReset(email.trim());
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

export function ResetPasswordScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

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
    if (!(await completeOwnerPasswordRecovery(password))) {
      setMessage("Password could not be updated. Request a new reset link.");
      setSubmitting(false);
      return;
    }

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

export function LoadingScreen() {
  return (
    <div className="center-screen" role="status">
      <span className="loading-mark">DC</span>
      <p>LOADING</p>
    </div>
  );
}

export function SetupScreen() {
  return (
    <div className="center-screen">
      <span className="loading-mark">DC</span>
      <h1>SETUP REQUIRED</h1>
      <p>Cloud connection is not configured.</p>
    </div>
  );
}
