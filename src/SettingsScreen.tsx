import { useState } from "react";
import type { OfflineSyncState } from "./hooks/use-offline-sync.js";
import type { EditingDeviceAccess } from "./offline-sync.js";
import type { WeightUnit } from "./weight-conversion.js";

export default function SettingsScreen({
  deviceAccess,
  online,
  onBack,
  onChangeUnit,
  onSignOut,
  syncState,
  unit,
}: {
  deviceAccess: EditingDeviceAccess;
  online: boolean;
  onBack: () => void;
  onChangeUnit: (unit: WeightUnit) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  syncState: OfflineSyncState;
  unit: WeightUnit;
}) {
  const [saving, setSaving] = useState(false);
  const changeUnit = async (next: WeightUnit) => {
    if (next === unit || saving || deviceAccess !== "active") return;
    setSaving(true);
    await onChangeUnit(next);
    setSaving(false);
  };
  const canSignOut = online && syncState === "synced";

  return (
    <div className="app-shell settings-screen">
      <style>{settingsStyles}</style>
      <header className="settings-header">
        <button aria-label="Back" onClick={onBack} type="button">
          ‹
        </button>
        <h1>SETTINGS</h1>
      </header>
      <main>
        <p className="section-label">WEIGHT UNIT</p>
        <section className="settings-card">
          <h2>Display weights in</h2>
          <div aria-label="Weight unit" className="unit-control" role="group">
            {(["lb", "kg"] as const).map((choice) => (
              <button
                aria-pressed={unit === choice}
                disabled={saving || deviceAccess !== "active"}
                key={choice}
                onClick={() => void changeUnit(choice)}
                type="button"
              >
                {choice.toUpperCase()}
              </button>
            ))}
          </div>
          <p>
            Changing units converts weights everywhere. Your workout history
            stays together.
          </p>
          {deviceAccess !== "active" && (
            <p className="quiet-note">
              TRANSFER EDIT ACCESS TO CHANGE SETTINGS
            </p>
          )}
        </section>
        <button
          className="secondary-action settings-sign-out"
          disabled={!canSignOut}
          onClick={() => void onSignOut()}
          type="button"
        >
          SIGN OUT
        </button>
        {!online && <p className="quiet-note">CONNECT TO SIGN OUT</p>}
        {online && syncState !== "synced" && (
          <p className="quiet-note">SYNC BEFORE SIGNING OUT</p>
        )}
      </main>
      <footer>DC TRAINING</footer>
    </div>
  );
}

const settingsStyles = `
.settings-screen { min-height: 100svh; display: flex; flex-direction: column; }
.settings-header { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; border-bottom: 1px solid var(--line); padding: 10px 0 24px; }
.settings-header button { min-width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 3.4rem; line-height: .7; cursor: pointer; }
.settings-header h1 { margin: 0; font-size: 2rem; text-align: center; }
.settings-screen main { flex: 1; padding-top: 44px; }
.settings-screen .section-label { margin-bottom: 18px; font-size: 1.45rem; }
.settings-card { border: 1px solid var(--line); border-radius: 12px; padding: 26px 22px; }
.settings-card h2 { margin: 0 0 24px; font-size: 2rem; }
.unit-control { display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; }
.unit-control button { min-height: 68px; border: 0; color: var(--gray); background: transparent; font-family: Impact, sans-serif; font-size: 1.8rem; cursor: pointer; }
.unit-control button[aria-pressed="true"] { color: var(--white); background: var(--red); }
.unit-control button:disabled { cursor: not-allowed; }
.settings-card > p { margin: 24px 0 0; color: var(--gray); font-size: 1.05rem; line-height: 1.5; }
.settings-sign-out { margin-top: 44px; }
.settings-screen footer { padding: 48px 0 max(12px, env(safe-area-inset-bottom)); color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .08em; text-align: center; }
`;
