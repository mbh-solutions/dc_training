import type { FoundationHomeProps } from "./FoundationHome.js";
import { WORKOUT_SLOTS, type WorkoutSlot } from "./rotation-config.js";

type HomeScreenProps = Omit<FoundationHomeProps, "userId"> & {
  activeSlot: WorkoutSlot | null;
  lastCompletedSlot: WorkoutSlot | null;
  loadingWorkout: boolean;
  message: string;
  nextSlot: WorkoutSlot;
  onOpenRotation: () => void;
  onResumeWorkout: () => void;
  onStartWorkout: () => Promise<void>;
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
  lastCompletedSlot,
  loadingWorkout,
  message,
  nextSlot,
  online,
  onOpenRotation,
  onResumeWorkout,
  onSignOut,
  onStartWorkout,
  syncState,
}: HomeScreenProps) {
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
          loading={loadingWorkout}
          nextSlot={nextSlot}
          online={online}
          resume={onResumeWorkout}
          start={onStartWorkout}
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
].join("\n");

function WorkoutCard({
  activeSlot,
  loading,
  nextSlot,
  online,
  resume,
  start,
}: {
  activeSlot: WorkoutSlot | null;
  loading: boolean;
  nextSlot: WorkoutSlot;
  online: boolean;
  resume: () => void;
  start: () => Promise<void>;
}) {
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

export default HomeScreen;
