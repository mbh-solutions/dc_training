import { useState } from "react";
import type { FoundationHomeProps } from "./FoundationHome.js";
import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";
import type { TrainingLifecycle } from "./workout-domain.js";

type HomeScreenProps = Omit<FoundationHomeProps, "userId"> & {
  activeSlot: WorkoutSlot | null;
  actionSaving: boolean;
  lastCompletedSlot: WorkoutSlot | null;
  lifecycle: TrainingLifecycle | null;
  loadingWorkout: boolean;
  message: string;
  nextSlot: WorkoutSlot;
  onOpenHistory: () => void;
  onOpenRotation: () => void;
  onResumeWorkout: () => void;
  onStartCruise: () => Promise<boolean>;
  onStartNewBlast: () => Promise<boolean>;
  onStartWorkout: () => Promise<void>;
  onDismissCruiseSuggestion: () => Promise<boolean>;
};

const summaries: Record<WorkoutSlot, string> = {
  A1: "CHEST · SHOULDERS · TRICEPS · BACK",
  A2: "CHEST · SHOULDERS · TRICEPS · BACK",
  A3: "CHEST · SHOULDERS · TRICEPS · BACK",
  B1: "BICEPS · FOREARMS · CALVES · HAMSTRINGS · QUADS · ABS",
  B2: "BICEPS · FOREARMS · CALVES · HAMSTRINGS · QUADS · ABS",
  B3: "BICEPS · FOREARMS · CALVES · HAMSTRINGS · QUADS · ABS",
};

function HomeScreen({
  cloudStatus,
  email,
  activeSlot,
  actionSaving,
  lastCompletedSlot,
  lifecycle,
  loadingWorkout,
  message,
  nextSlot,
  online,
  onOpenHistory,
  onOpenRotation,
  onResumeWorkout,
  onSignOut,
  onStartCruise,
  onStartNewBlast,
  onStartWorkout,
  onDismissCruiseSuggestion,
  syncState,
}: HomeScreenProps) {
  const [cruiseConfirmationOpen, setCruiseConfirmationOpen] = useState(false);

  if (lifecycle?.phase === "cruise")
    return (
      <CruiseHome
        actionSaving={actionSaving}
        email={email}
        message={message}
        nextSlot={nextSlot}
        online={online}
        onOpenHistory={onOpenHistory}
        onSignOut={onSignOut}
        onStartNewBlast={onStartNewBlast}
        syncState={syncState}
      />
    );

  return (
    <div className="app-shell">
      <style>{homeStyles}</style>
      <header className="app-header">
        <div>
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>DC TRAINING</h1>
        </div>
        <span className="foundation-mark" aria-label="Settings">
          ⚙
        </span>
      </header>

      <NetworkStatus online={online} syncState={syncState} />

      <main>
        <WorkoutCard
          activeSlot={activeSlot}
          actionSaving={actionSaving}
          loading={loadingWorkout}
          nextSlot={nextSlot}
          online={online}
          onStartCruise={() => setCruiseConfirmationOpen(true)}
          resume={onResumeWorkout}
          start={onStartWorkout}
          unavailable={lifecycle === null}
        />

        <RotationTracker
          lastCompletedSlot={lastCompletedSlot}
          nextSlot={nextSlot}
        />

        {lastCompletedSlot && (
          <section className="last-workout">
            <p className="section-label">LAST WORKOUT</p>
            <strong>{lastCompletedSlot} COMPLETE</strong>
          </section>
        )}

        {message && <p className="form-message">{message}</p>}

        <p className="account-email">SIGNED IN AS {email?.toUpperCase()}</p>
        <button
          className="primary-action"
          type="button"
          onClick={onOpenRotation}
          disabled={!online}
        >
          ROTATION SETUP
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void onSignOut()}
          disabled={!online}
        >
          SIGN OUT
        </button>
        {!online && <p className="quiet-note">CONNECT TO SIGN OUT</p>}
        <p className="quiet-note">
          APP FOUNDATION · AUTHENTICATED · {cloudStatus} ·{" "}
          {email?.toUpperCase()}
        </p>
      </main>
      <BottomNavigation
        active="home"
        onHome={() => undefined}
        onHistory={onOpenHistory}
        onRotation={onOpenRotation}
      />
      <LifecycleSheets
        confirmationOpen={cruiseConfirmationOpen}
        lifecycle={lifecycle}
        message={message}
        nextSlot={nextSlot}
        online={online}
        onDismiss={onDismissCruiseSuggestion}
        onStartCruise={onStartCruise}
        saving={actionSaving}
        setConfirmationOpen={setCruiseConfirmationOpen}
      />
    </div>
  );
}

const homeStyles = [
  ".rotation-tracker,",
  ".last-workout { margin-top: 28px; }",
  ".rotation-tracker > div { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 12px; }",
  ".rotation-tracker span { min-height: 56px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 6px; color: #555552; font-family: Impact, sans-serif; }",
  ".rotation-tracker .rotation-next { border-color: var(--red); color: var(--red); }",
  ".last-workout { border: 1px solid var(--line); border-radius: 8px; padding: 22px; }",
  ".last-workout strong { display: block; margin-top: 12px; font-family: Impact, sans-serif; font-size: 1.8rem; }",
  ".cruise-action { margin-top: 12px; }",
  ".cruise-phase { margin: 20px 4px 0; color: var(--red); font-family: Impact, sans-serif; font-size: 1.45rem; letter-spacing: .08em; }",
  ".cruise-title { margin: 4px 4px 24px; font-size: clamp(4.2rem, 19vw, 6.5rem); line-height: .95; }",
  ".cruise-card { margin-top: 0; }",
  ".cruise-card strong { display: block; margin: 8px 0 22px; font-family: Impact, sans-serif; font-size: clamp(4rem, 18vw, 6rem); }",
  ".cruise-card b { font-family: Impact, sans-serif; font-size: 1.15rem; letter-spacing: .06em; }",
  ".cruise-card .foundation-copy { margin: 8px 0 18px; }",
  ".cruise-card .preserved-copy { margin: 0; color: var(--gray); line-height: 1.5; }",
  ".cruise-rules { margin: 28px 4px; }",
  ".cruise-rules ul { display: grid; gap: 18px; margin: 18px 0 0; padding: 0; list-style: none; }",
  ".cruise-rules li { display: flex; align-items: center; gap: 12px; color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .05em; }",
  ".cruise-rules li::before { content: '✓'; display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border: 1px solid var(--gray); border-radius: 50%; }",
].join("\n");

function CruiseHome({
  actionSaving,
  email,
  message,
  nextSlot,
  online,
  onOpenHistory,
  onSignOut,
  onStartNewBlast,
  syncState,
}: {
  actionSaving: boolean;
  email?: string;
  message: string;
  nextSlot: WorkoutSlot;
  online: boolean;
  onOpenHistory: () => void;
  onSignOut: () => Promise<void>;
  onStartNewBlast: () => Promise<boolean>;
  syncState: FoundationHomeProps["syncState"];
}) {
  return (
    <div className="app-shell">
      <style>{homeStyles}</style>
      <header className="app-header">
        <div>
          <h1>DC TRAINING</h1>
        </div>
        <span className="foundation-mark" aria-label="Settings">
          ⚙
        </span>
      </header>
      <NetworkStatus online={online} syncState={syncState} />
      <main>
        <p className="cruise-phase">CRUISE</p>
        <h2 className="cruise-title">RECOVERY</h2>
        <section className="foundation-card cruise-card">
          <p className="section-label">ROTATION PAUSED</p>
          <strong>{nextSlot}</strong>
          <b>NEXT WORKOUT</b>
          <p className="foundation-copy">{summaries[nextSlot]}</p>
          <p className="preserved-copy">
            Your rotation and assignments are preserved.
          </p>
        </section>
        <section className="cruise-rules">
          <p className="section-label">CRUISE</p>
          <ul>
            <li>NO DC WORKOUTS LOGGED</li>
            <li>HISTORY REMAINS AVAILABLE</li>
          </ul>
        </section>
        <button
          className="primary-action"
          disabled={!online || actionSaving}
          onClick={() => void onStartNewBlast()}
          type="button"
        >
          {actionSaving ? "SAVING" : "START NEW BLAST"}
        </button>
        <p className="quiet-note">
          Continue with {nextSlot} when you are ready.
        </p>
        {!online && <p className="quiet-note">CONNECT TO START A NEW BLAST</p>}
        {message && <p className="form-message">{message}</p>}
        <p className="account-email">SIGNED IN AS {email?.toUpperCase()}</p>
        <button
          className="secondary-action"
          disabled={!online}
          onClick={() => void onSignOut()}
          type="button"
        >
          SIGN OUT
        </button>
        {!online && <p className="quiet-note">CONNECT TO SIGN OUT</p>}
      </main>
      <BottomNavigation
        active="home"
        onHome={() => undefined}
        onHistory={onOpenHistory}
        onRotation={() => undefined}
        rotationDisabled
      />
    </div>
  );
}

function LifecycleSheets({
  confirmationOpen,
  lifecycle,
  message,
  nextSlot,
  online,
  onDismiss,
  onStartCruise,
  saving,
  setConfirmationOpen,
}: {
  confirmationOpen: boolean;
  lifecycle: TrainingLifecycle | null;
  message: string;
  nextSlot: WorkoutSlot;
  online: boolean;
  onDismiss: () => Promise<boolean>;
  onStartCruise: () => Promise<boolean>;
  saving: boolean;
  setConfirmationOpen: (open: boolean) => void;
}) {
  if (confirmationOpen)
    return (
      <CruiseConfirmation
        message={message}
        nextSlot={nextSlot}
        online={online}
        saving={saving}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={async () => {
          if (await onStartCruise()) setConfirmationOpen(false);
        }}
      />
    );

  if (online && lifecycle?.suggestion_due === true)
    return (
      <CruiseSuggestion
        message={message}
        nextSlot={nextSlot}
        online={online}
        saving={saving}
        onDismiss={onDismiss}
        onStart={() => setConfirmationOpen(true)}
      />
    );

  return null;
}

function CruiseConfirmation({
  message,
  nextSlot,
  online,
  onCancel,
  onConfirm,
  saving,
}: {
  message: string;
  nextSlot: WorkoutSlot;
  online: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  saving: boolean;
}) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        aria-labelledby="cruise-confirmation-title"
        aria-modal="true"
        className="bottom-sheet"
        role="dialog"
      >
        <h2 id="cruise-confirmation-title">START CRUISE?</h2>
        <p>
          Your rotation will pause. {nextSlot} will remain your next workout.
        </p>
        <div className="sheet-status">
          <span>ROTATION PAUSED</span>
          <strong>{nextSlot} NEXT</strong>
        </div>
        {message && <p className="form-message">{message}</p>}
        <button
          className="primary-action"
          disabled={!online || saving}
          onClick={() => void onConfirm()}
          type="button"
        >
          {saving ? "SAVING" : "START CRUISE"}
        </button>
        <button
          className="secondary-action sheet-secondary"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          CANCEL
        </button>
      </section>
      <style>{sheetStyles}</style>
    </div>
  );
}

function CruiseSuggestion({
  message,
  nextSlot,
  online,
  onDismiss,
  onStart,
  saving,
}: {
  message: string;
  nextSlot: WorkoutSlot;
  online: boolean;
  onDismiss: () => Promise<boolean>;
  onStart: () => void;
  saving: boolean;
}) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        aria-labelledby="cruise-suggestion-title"
        aria-modal="true"
        className="bottom-sheet"
        role="dialog"
      >
        <p className="sheet-kicker">BLAST STATUS</p>
        <h2 id="cruise-suggestion-title">IT'S BEEN 7 WEEKS</h2>
        <h3>CONSIDER A CRUISE</h3>
        <p>
          If you start a cruise, {nextSlot} will be your next blast workout.
        </p>
        {message && <p className="form-message">{message}</p>}
        <button
          className="primary-action"
          disabled={!online || saving}
          onClick={onStart}
          type="button"
        >
          START CRUISE
        </button>
        <button
          className="secondary-action sheet-secondary"
          disabled={!online || saving}
          onClick={() => void onDismiss()}
          type="button"
        >
          {saving ? "SAVING" : "NOT NOW"}
        </button>
      </section>
      <style>{sheetStyles}</style>
    </div>
  );
}

const sheetStyles = `
.sheet-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; align-items: end; justify-items: center; padding-top: 24px; background: rgba(0,0,0,.76); }
.bottom-sheet { width: min(100%, 520px); border: 1px solid var(--line); border-bottom: 0; border-radius: 16px 16px 0 0; padding: 30px 24px max(28px, env(safe-area-inset-bottom)); background: #0b0b0b; box-shadow: 0 -16px 50px rgba(0,0,0,.55); }
.bottom-sheet h2 { margin: 8px 0 14px; font-size: clamp(2.35rem, 11vw, 3.9rem); line-height: 1; }
.bottom-sheet > p:not(.section-label) { margin: 0; color: #a7a7a3; line-height: 1.5; }
.bottom-sheet h3 { margin: 0 0 12px; color: var(--red); font-family: Impact, sans-serif; font-size: 1.45rem; letter-spacing: .06em; text-align: center; }
.bottom-sheet .sheet-kicker { color: #bdbdba; text-align: center; }
.sheet-status { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-family: Impact, sans-serif; letter-spacing: .05em; }
.sheet-status span { color: var(--gray); }
.sheet-status strong { color: var(--white); }
.sheet-status strong::first-letter { color: var(--red); }
.bottom-sheet .sheet-secondary { margin-top: 10px; border-color: var(--line); }
`;

function WorkoutCard({
  activeSlot,
  actionSaving,
  loading,
  nextSlot,
  online,
  onStartCruise,
  resume,
  start,
  unavailable,
}: {
  activeSlot: WorkoutSlot | null;
  actionSaving: boolean;
  loading: boolean;
  nextSlot: WorkoutSlot;
  online: boolean;
  onStartCruise: () => void;
  resume: () => void;
  start: () => Promise<void>;
  unavailable: boolean;
}) {
  if (unavailable) return <UnavailableWorkoutCard loading={loading} />;

  const slot = activeSlot ?? nextSlot;
  return (
    <section className="foundation-card" aria-labelledby="foundation-title">
      <p className="section-label">
        {activeSlot ? "WORKOUT IN PROGRESS" : "NEXT WORKOUT"}
      </p>
      <h2 id="foundation-title">{slot}</h2>
      <p className="foundation-copy">{summaries[slot]}</p>
      <button
        className="primary-action"
        type="button"
        disabled={!online || loading}
        onClick={activeSlot ? resume : () => void start()}
      >
        {activeSlot ? `RESUME ${activeSlot}` : `START ${nextSlot}`}
      </button>
      {!activeSlot && (
        <button
          className="secondary-action cruise-action"
          type="button"
          disabled={!online || loading || actionSaving}
          onClick={onStartCruise}
        >
          START CRUISE
        </button>
      )}
    </section>
  );
}

function UnavailableWorkoutCard({ loading }: { loading: boolean }) {
  return (
    <section className="foundation-card" aria-labelledby="foundation-title">
      <p className="section-label">TRAINING STATUS</p>
      <h2 id="foundation-title">{loading ? "LOADING" : "UNAVAILABLE"}</h2>
      <p className="foundation-copy">
        {loading
          ? "CHECKING YOUR TRAINING PHASE"
          : "TRAINING CONTROLS ARE LOCKED"}
      </p>
    </section>
  );
}

function RotationTracker({
  lastCompletedSlot,
  nextSlot,
}: Pick<HomeScreenProps, "lastCompletedSlot" | "nextSlot">) {
  return (
    <section aria-label="ROTATION" className="rotation-tracker">
      <p className="section-label">ROTATION</p>
      <div>
        {WORKOUT_SLOTS.map((slot) => (
          <span className={slot === nextSlot ? "rotation-next" : ""} key={slot}>
            {slot}
            {lastCompletedSlot === slot ? " ✓" : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function NetworkStatus({
  online,
  syncState,
}: Pick<FoundationHomeProps, "online" | "syncState">) {
  if (!online)
    return <div className="status-strip">OFFLINE · SAVED ON DEVICE</div>;

  const label =
    syncState === "syncing"
      ? "SYNCING"
      : syncState === "synced"
        ? "SYNCED"
        : "ONLINE";
  return <div className="status-strip status-strip--quiet">{label}</div>;
}

export function BottomNavigation({
  active,
  onHistory,
  onHome,
  onRotation,
  rotationDisabled = false,
}: {
  active: "history" | "home" | "rotation";
  onHistory: () => void;
  onHome: () => void;
  onRotation: () => void;
  rotationDisabled?: boolean;
}) {
  return (
    <nav aria-label="Primary" className="bottom-navigation">
      <style>{bottomNavigationStyles}</style>
      <button
        aria-current={active === "home" ? "page" : undefined}
        onClick={onHome}
        type="button"
      >
        <span>⌂</span>HOME
      </button>
      <button
        aria-current={active === "history" ? "page" : undefined}
        onClick={onHistory}
        type="button"
      >
        <span>◷</span>HISTORY
      </button>
      <button
        aria-current={active === "rotation" ? "page" : undefined}
        disabled={rotationDisabled}
        onClick={onRotation}
        type="button"
      >
        <span>⟳</span>ROTATION
      </button>
    </nav>
  );
}

const bottomNavigationStyles = `
.bottom-navigation { position: sticky; z-index: 5; bottom: 0; display: grid; grid-template-columns: repeat(3, 1fr); margin: 36px -22px calc(-28px - env(safe-area-inset-bottom)); border-top: 1px solid var(--line); padding: 10px 10px max(12px, env(safe-area-inset-bottom)); background: rgba(7,7,7,.96); backdrop-filter: blur(16px); }
.bottom-navigation button { min-height: 58px; display: grid; place-items: center; gap: 2px; border: 0; color: var(--gray); background: transparent; font-size: .82rem; cursor: pointer; }
.bottom-navigation button span { font-family: sans-serif; font-size: 1.8rem; line-height: 1; }
.bottom-navigation button[aria-current="page"] { color: var(--red); }
.bottom-navigation button:disabled { cursor: not-allowed; opacity: .35; }
`;

export default HomeScreen;
