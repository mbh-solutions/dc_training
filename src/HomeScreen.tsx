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
          {cloudStatus} · {email?.toUpperCase()}
        </p>
      </main>
    </div>
  );
}

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
        disabled={!online || loading || (!activeSlot && nextSlot !== "A1")}
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
