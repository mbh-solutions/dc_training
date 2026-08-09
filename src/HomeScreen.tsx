import type { FoundationHomeProps } from "./FoundationHome.js";

type HomeScreenProps = Omit<FoundationHomeProps, "userId"> & {
  onOpenRotation: () => void;
};

function HomeScreen({
  cloudStatus,
  email,
  online,
  onOpenRotation,
  onSignOut,
  syncState,
}: HomeScreenProps) {
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

      <NetworkStatus online={online} syncState={syncState} />

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
      </main>
    </div>
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
