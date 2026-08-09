import {
  CHEST_EXERCISES,
  type Assignment,
  type Protocol,
} from "./hooks/use-rotation-assignment.js";
import type { RangeChoice, Screen } from "./RotationSetup.js";

type ChestExercise = (typeof CHEST_EXERCISES)[number];

function formatTargetRange(min: number | null, max: number | null) {
  return min && max ? `${min}–${max}` : "NOT APPLICABLE";
}

const rotationStyles = `
.account-email + .primary-action {
  margin-bottom: 12px;
}

.rotation-shell {
  display: flex;
  flex-direction: column;
}

.flow-header {
  min-height: 102px;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: start;
  padding: 22px 0 24px;
  text-align: center;
}

.flow-header > div {
  grid-column: 2;
}

.flow-header h1 {
  margin: 0;
  font-size: 1.55rem;
}

.flow-header p {
  margin: 7px 0 0;
  color: var(--red);
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  font-size: 1rem;
  letter-spacing: 0.08em;
}

.back-action {
  grid-column: 1;
  grid-row: 1;
  width: 44px;
  min-height: 44px;
  border: 0;
  color: var(--white);
  background: transparent;
  font-size: 3rem;
  line-height: 0.7;
  cursor: pointer;
}

.rotation-label {
  margin: 14px 2px 16px;
  color: var(--red);
}

.assignment-card,
.choice-card,
.review-list div,
.assignment-summary {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(22, 22, 22, 0.9), rgba(11, 11, 11, 0.96));
}

.assignment-card {
  position: relative;
  width: 100%;
  min-height: 102px;
  display: grid;
  gap: 8px;
  border-color: var(--red);
  padding: 20px 48px 20px 20px;
  color: var(--white);
  text-align: left;
  cursor: pointer;
}

.assignment-card:disabled {
  cursor: wait;
  opacity: 0.6;
}

.assignment-card span {
  color: var(--red);
  font-size: 0.9rem;
}

.assignment-card strong {
  font-size: 1.2rem;
}

.assignment-card b {
  position: absolute;
  right: 20px;
  top: 33px;
  font-size: 2rem;
}

.assignment-summary {
  margin: 16px 0 0;
  padding: 6px 20px;
}

.assignment-summary div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 0;
}

.assignment-summary div + div {
  border-top: 1px solid #2b2b29;
}

.assignment-summary dt,
.assignment-summary dd {
  margin: 0;
  font-size: 0.9rem;
}

.assignment-summary dt { color: var(--gray); }

.choice-list {
  display: grid;
  gap: 11px;
}

.choice-card {
  position: relative;
  min-height: 82px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 58px 18px 17px;
  cursor: pointer;
}

.choice-card--selected {
  border-color: var(--red);
}

.choice-card input {
  position: absolute;
  opacity: 0;
}

.choice-card strong {
  font-size: 1.12rem;
}

.choice-dot {
  position: absolute;
  right: 18px;
  width: 28px;
  height: 28px;
  border: 2px solid #747471;
  border-radius: 50%;
}

.choice-card--selected .choice-dot {
  border: 5px solid #25100f;
  background: var(--red);
  box-shadow: 0 0 0 2px var(--red);
}

.dc-badge {
  border: 1px solid var(--red);
  border-radius: 4px;
  padding: 4px 7px;
  color: var(--white);
  font-size: 0.72rem;
}

.info-action {
  min-width: 44px;
  min-height: 44px;
  margin: -8px 0 12px;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--white);
  background: transparent;
  cursor: pointer;
}

.protocol-info {
  margin: 0 0 14px;
  border-left: 2px solid var(--red);
  padding: 10px 14px;
  color: #bdbdba;
  line-height: 1.4;
}

.exercise-heading,
.review-exercise {
  margin: 5px 0 30px;
  font-size: clamp(2rem, 10vw, 3.2rem);
  text-transform: uppercase;
}

.custom-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.custom-range label {
  color: var(--gray);
  font-size: 0.8rem;
}

.custom-range input {
  width: 100%;
  min-height: 54px;
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 14px;
  color: var(--white);
  background: var(--panel);
}

.review-list {
  display: grid;
  gap: 14px;
  margin: 0;
}

.review-list div {
  padding: 22px 20px;
}

.review-list dt,
.review-list dd {
  margin: 0;
}

.review-list dt {
  color: var(--gray);
  font-size: 0.85rem;
}

.review-list dd {
  margin-top: 8px;
  font-size: 1.35rem;
}

.flow-action {
  margin-top: 28px;
}

.primary-action {
  margin-top: 24px;
  border: 1px solid var(--red);
  background: linear-gradient(120deg, #d9211c, var(--red));
}

.secondary-action {
  border: 1px solid var(--red);
  background: transparent;
}
`;

type RotationSetupViewProps = {
  customMax: string;
  customMin: string;
  editAssignment: () => void;
  exercise: ChestExercise | "";
  loadState: "loading" | "ready" | "failed";
  message: string;
  onBack: () => void;
  protocol: Protocol | "";
  rangeChoice: RangeChoice | "";
  rangeValid: boolean;
  saved: Assignment | null;
  save: () => Promise<void>;
  saving: boolean;
  screen: Screen;
  selectExercise: (next: ChestExercise) => void;
  selectProtocol: (next: Protocol) => void;
  setCustomMax: (value: string) => void;
  setCustomMin: (value: string) => void;
  setRangeChoice: (value: RangeChoice) => void;
  setScreen: (value: Screen) => void;
  setShowProtocolInfo: (value: (shown: boolean) => boolean) => void;
  showProtocolInfo: boolean;
  target: number[];
};

function RotationSetupView({
  customMax,
  customMin,
  editAssignment,
  exercise,
  loadState,
  message,
  onBack,
  protocol,
  rangeChoice,
  rangeValid,
  saved,
  save,
  saving,
  screen,
  selectExercise,
  selectProtocol,
  setCustomMax,
  setCustomMin,
  setRangeChoice,
  setScreen,
  setShowProtocolInfo,
  showProtocolInfo,
  target,
}: RotationSetupViewProps) {
  const renderSetup = () => (
    <Shell title="ROTATION SETUP" onBack={onBack}>
      <p className="section-label rotation-label">A1 WORKOUT</p>
      <button
        className="assignment-card"
        type="button"
        onClick={editAssignment}
        disabled={loadState !== "ready"}
      >
        <span>CHEST</span>
        <strong>
          {loadState === "loading"
            ? "LOADING ASSIGNMENT"
            : (saved?.exercise ?? "CHOOSE EXERCISE")}
        </strong>
        <b aria-hidden="true">›</b>
      </button>
      {saved && (
        <dl className="assignment-summary">
          <div>
            <dt>PROTOCOL</dt>
            <dd>{protocolLabel(saved.protocol)}</dd>
          </div>
          <div>
            <dt>TARGET RANGE</dt>
            <dd>{formatTargetRange(saved.target_min, saved.target_max)}</dd>
          </div>
        </dl>
      )}
      {message && <p className="form-message">{message}</p>}
    </Shell>
  );

  const renderProtocol = () => (
    <Shell
      title="SET PROTOCOL"
      subtitle="A1 · CHEST"
      onBack={() => setScreen("exercise")}
    >
      <h2 className="exercise-heading">{exercise}</h2>
      <p className="section-label rotation-label">PROTOCOL</p>
      <button
        className="info-action"
        type="button"
        aria-label="Chest protocol information"
        onClick={() => setShowProtocolInfo((shown) => !shown)}
      >
        ⓘ
      </button>
      {showProtocolInfo && (
        <p className="protocol-info">
          Classic DC uses one rest-pause work set.
        </p>
      )}
      <ChoiceList
        name="protocol"
        options={[
          { badge: "DC", label: "REST-PAUSE", value: "rest_pause" },
          { label: "STRAIGHT SET", value: "straight_set" },
        ]}
        selected={protocol}
        onSelect={(value) => selectProtocol(value as Protocol)}
      />
      <FooterButton
        disabled={!protocol}
        onClick={() =>
          setScreen(protocol === "rest_pause" ? "range" : "review")
        }
      >
        CONTINUE
      </FooterButton>
    </Shell>
  );

  if (screen === "setup") {
    return renderSetup();
  }

  if (screen === "exercise") {
    return (
      <Shell
        title="SELECT EXERCISE"
        subtitle="A1 · CHEST"
        onBack={() => setScreen("setup")}
      >
        <ChoiceList
          name="exercise"
          options={CHEST_EXERCISES.map((label) => ({ label, value: label }))}
          selected={exercise}
          onSelect={(value) => selectExercise(value as ChestExercise)}
        />
        <FooterButton
          disabled={!exercise}
          onClick={() => setScreen("protocol")}
        >
          CONTINUE
        </FooterButton>
      </Shell>
    );
  }

  if (screen === "protocol") {
    return renderProtocol();
  }

  if (screen === "range") {
    return (
      <Shell
        title="SET TARGET RANGE"
        subtitle="A1 · CHEST"
        onBack={() => setScreen("protocol")}
      >
        <h2 className="exercise-heading">{exercise}</h2>
        <p className="section-label rotation-label">TARGET TOTAL REPS</p>
        <ChoiceList
          name="range"
          options={[
            { badge: "DC", label: "11–15", value: "11-15" },
            { label: "15–20", value: "15-20" },
            { label: "CUSTOM", value: "custom" },
          ]}
          selected={rangeChoice}
          onSelect={(value) => setRangeChoice(value as RangeChoice)}
        />
        {rangeChoice === "custom" && (
          <div className="custom-range">
            <label>
              MINIMUM
              <input
                id="custom-min"
                type="number"
                min="1"
                inputMode="numeric"
                value={customMin}
                onChange={(event) => setCustomMin(event.target.value)}
              />
            </label>
            <label>
              MAXIMUM
              <input
                id="custom-max"
                type="number"
                min="1"
                inputMode="numeric"
                value={customMax}
                onChange={(event) => setCustomMax(event.target.value)}
              />
            </label>
          </div>
        )}
        <FooterButton
          disabled={!rangeValid}
          onClick={() => setScreen("review")}
        >
          CONTINUE
        </FooterButton>
      </Shell>
    );
  }

  return (
    <Shell
      title="REVIEW ASSIGNMENT"
      subtitle="A1 · CHEST"
      onBack={() => setScreen(protocol === "rest_pause" ? "range" : "protocol")}
    >
      <h2 className="review-exercise">{exercise}</h2>
      <dl className="review-list">
        <div>
          <dt>SLOT</dt>
          <dd>A1 · CHEST</dd>
        </div>
        <div>
          <dt>PROTOCOL</dt>
          <dd>{protocolLabel(protocol as Protocol)}</dd>
        </div>
        <div>
          <dt>TARGET TOTAL REPS</dt>
          <dd>
            {protocol === "rest_pause"
              ? formatTargetRange(target[0], target[1])
              : "NOT APPLICABLE"}
          </dd>
        </div>
      </dl>
      {message && <p className="form-message">{message}</p>}
      <FooterButton disabled={saving} onClick={() => void save()}>
        {saving ? "SAVING" : "SAVE"}
      </FooterButton>
    </Shell>
  );
}

function protocolLabel(protocol: Protocol) {
  return protocol === "rest_pause" ? "REST-PAUSE" : "STRAIGHT SET";
}

type Choice = { badge?: string; label: string; value: string };

function ChoiceList({
  name,
  onSelect,
  options,
  selected,
}: {
  name: string;
  onSelect: (value: string) => void;
  options: readonly Choice[];
  selected: string;
}) {
  return (
    <div className="choice-list">
      {options.map((option) => (
        <label
          className={`choice-card${selected === option.value ? " choice-card--selected" : ""}`}
          key={option.value}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selected === option.value}
            onChange={() => onSelect(option.value)}
          />
          <strong>{option.label}</strong>
          {option.badge && <span className="dc-badge">{option.badge}</span>}
          <span className="choice-dot" aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}

function FooterButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="primary-action flow-action"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Shell({
  children,
  onBack,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onBack: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <>
      <style>{rotationStyles}</style>
      <div className="app-shell rotation-shell">
        <header className="flow-header">
          <button
            className="back-action"
            type="button"
            onClick={onBack}
            aria-label="Back"
          >
            ‹
          </button>
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </>
  );
}

export default RotationSetupView;
