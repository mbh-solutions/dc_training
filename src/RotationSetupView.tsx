import {
  WORKOUT_SLOTS,
  positionLabel,
  positionsFor,
  protocolInfo,
  type AssignmentPosition,
  type Choice,
  type Protocol,
  type StructureChoice,
  type TargetSet,
  type WorkoutSlot,
} from "./rotation-config.js";
import {
  assignmentKey,
  type Assignment,
} from "./hooks/use-rotation-assignment.js";
import type { Screen } from "./RotationSetup.js";

type DraftTarget = { max: string; min: string };

const rotationStyles = `
.rotation-shell { display: flex; flex-direction: column; }
.flow-header { min-height: 102px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: start; padding: 22px 0 24px; text-align: center; }
.flow-header > div { grid-column: 2; }
.flow-header h1 { margin: 0; font-size: 1.55rem; }
.flow-header p { margin: 7px 0 0; color: var(--red); font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif; font-size: 1rem; letter-spacing: .08em; }
.back-action { grid-column: 1; grid-row: 1; width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 3rem; line-height: .7; cursor: pointer; }
.rotation-label { margin: 20px 2px 10px; color: var(--red); }
.workout-group { display: grid; gap: 8px; margin-bottom: 28px; }
.assignment-card, .choice-card, .review-list div { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(145deg, rgba(22,22,22,.9), rgba(11,11,11,.96)); }
.assignment-card { position: relative; width: 100%; min-height: 76px; display: grid; gap: 5px; border-color: #292927; padding: 14px 44px 14px 16px; color: var(--white); text-align: left; cursor: pointer; }
.assignment-card:disabled { cursor: wait; opacity: .6; }
.assignment-card span { color: var(--red); font-size: .78rem; }
.assignment-card strong { font-size: 1rem; }
.assignment-card small { color: var(--gray); font-size: .72rem; }
.assignment-card b { position: absolute; right: 16px; top: 23px; font-size: 1.8rem; }
.choice-list { display: grid; gap: 11px; }
.choice-card { position: relative; min-height: 76px; display: flex; align-items: center; gap: 12px; padding: 16px 58px 16px 17px; cursor: pointer; }
.choice-card--selected { border-color: var(--red); }
.choice-card input { position: absolute; opacity: 0; }
.choice-card strong { font-size: 1.08rem; }
.choice-dot { position: absolute; right: 18px; width: 28px; height: 28px; border: 2px solid #747471; border-radius: 50%; }
.choice-card--selected .choice-dot { border: 5px solid #25100f; background: var(--red); box-shadow: 0 0 0 2px var(--red); }
.dc-badge { border: 1px solid var(--red); border-radius: 4px; padding: 4px 7px; color: var(--white); font-size: .72rem; }
.info-action { min-width: 44px; min-height: 44px; margin: -8px 0 12px; border: 1px solid var(--line); border-radius: 50%; color: var(--white); background: transparent; cursor: pointer; }
.protocol-info { margin: 0 0 14px; border-left: 2px solid var(--red); padding: 10px 14px; color: #bdbdba; line-height: 1.4; white-space: pre-line; }
.exercise-heading, .review-exercise { margin: 5px 0 30px; font-size: clamp(2rem,10vw,3.2rem); text-transform: uppercase; }
.custom-sets { display: grid; gap: 14px; margin-top: 18px; }
.set-count, .target-pair { display: grid; gap: 8px; color: var(--gray); font-size: .8rem; }
.target-pair { grid-template-columns: 1fr 1fr; }
.target-pair p { grid-column: 1 / -1; margin: 0; color: var(--white); }
.custom-sets input { width: 100%; min-height: 54px; border: 1px solid var(--line); border-radius: 6px; padding: 0 14px; color: var(--white); background: var(--panel); }
.review-list { display: grid; gap: 14px; margin: 0; }
.review-list div { padding: 19px 20px; }
.review-list dt, .review-list dd { margin: 0; }
.review-list dt { color: var(--gray); font-size: .85rem; }
.review-list dd { margin-top: 8px; font-size: 1.25rem; }
.flow-action { margin-top: 28px; }
`;

type Props = {
  assignment: Assignment | null;
  availableExercises: readonly string[];
  availableProtocols: readonly Choice[];
  availableStructures: readonly StructureChoice[];
  customTargets: DraftTarget[];
  editAssignment: (slot: WorkoutSlot, position: AssignmentPosition) => void;
  exercise: string;
  loadState: "loading" | "ready" | "failed";
  message: string;
  onBack: () => void;
  onExerciseBack: () => void;
  onExerciseContinue: () => void;
  onProtocolBack: () => void;
  onProtocolContinue: () => void;
  onReviewBack: () => void;
  onStructureBack: () => void;
  onStructureContinue: () => void;
  position: AssignmentPosition;
  protocol: Protocol | "";
  save: () => Promise<void>;
  saved: Record<string, Assignment>;
  saving: boolean;
  screen: Screen;
  selectExercise: (exercise: string) => void;
  selectProtocol: (protocol: Protocol) => void;
  selectStructure: (structure: string) => void;
  setCustomSetCount: (count: number) => void;
  setShowProtocolInfo: (value: (shown: boolean) => boolean) => void;
  showProtocolInfo: boolean;
  slot: WorkoutSlot;
  structure: string;
  structureValid: boolean;
  targets: TargetSet[];
  updateCustomTarget: (
    index: number,
    field: keyof DraftTarget,
    value: string,
  ) => void;
};

function RotationSetupView(props: Props) {
  const subtitle = `${props.slot} · ${positionLabel(props.position)}`;

  if (props.screen === "setup")
    return (
      <Shell title="ROTATION SETUP" onBack={props.onBack}>
        {WORKOUT_SLOTS.map((workout) => (
          <section className="workout-group" key={workout}>
            <p className="section-label rotation-label">{workout} WORKOUT</p>
            {positionsFor(workout).map((bodyPart) => {
              const saved = props.saved[assignmentKey(workout, bodyPart)];
              return (
                <button
                  className="assignment-card"
                  type="button"
                  key={bodyPart}
                  onClick={() => props.editAssignment(workout, bodyPart)}
                  disabled={props.loadState !== "ready"}
                >
                  <span>{positionLabel(bodyPart)}</span>
                  <strong>
                    {props.loadState === "loading"
                      ? "LOADING ASSIGNMENT"
                      : (saved?.exercise ?? "CHOOSE EXERCISE")}
                  </strong>
                  {saved && (
                    <small>
                      {protocolLabel(saved.protocol)} ·{" "}
                      {formatTargets(saved.target_sets)}
                    </small>
                  )}
                  <b aria-hidden="true">›</b>
                </button>
              );
            })}
          </section>
        ))}
        {props.message && <p className="form-message">{props.message}</p>}
      </Shell>
    );

  if (props.screen === "exercise")
    return (
      <Shell
        title="SELECT EXERCISE"
        subtitle={subtitle}
        onBack={props.onExerciseBack}
      >
        <ChoiceList
          name="exercise"
          options={props.availableExercises.map((label) => ({
            label,
            value: label,
          }))}
          selected={props.exercise}
          onSelect={props.selectExercise}
        />
        <FooterButton
          disabled={!props.exercise}
          onClick={props.onExerciseContinue}
        >
          CONTINUE
        </FooterButton>
      </Shell>
    );

  if (props.screen === "protocol") {
    const info = protocolInfo(props.position, props.exercise);
    return (
      <Shell
        title="SET PROTOCOL"
        subtitle={subtitle}
        onBack={props.onProtocolBack}
      >
        <h2 className="exercise-heading">{props.exercise}</h2>
        <p className="section-label rotation-label">PROTOCOL</p>
        {info && (
          <>
            <button
              className="info-action"
              type="button"
              aria-label={`${positionLabel(props.position)} protocol information`}
              onClick={() => props.setShowProtocolInfo((shown) => !shown)}
            >
              ⓘ
            </button>
            {props.showProtocolInfo && <p className="protocol-info">{info}</p>}
          </>
        )}
        <ChoiceList
          name="protocol"
          options={props.availableProtocols}
          selected={props.protocol}
          onSelect={(value) => props.selectProtocol(value as Protocol)}
        />
        <FooterButton
          disabled={!props.protocol}
          onClick={props.onProtocolContinue}
        >
          CONTINUE
        </FooterButton>
      </Shell>
    );
  }

  if (props.screen === "structure")
    return (() => {
      const info = props.availableStructures.find(
        (choice) => choice.value === props.structure,
      )?.info;
      return (
        <Shell
          title={
            props.protocol === "rest_pause"
              ? "SET TARGET RANGE"
              : "SET STRUCTURE"
          }
          subtitle={subtitle}
          onBack={props.onStructureBack}
        >
          <h2 className="exercise-heading">{props.exercise}</h2>
          <ChoiceList
            name="structure"
            options={props.availableStructures}
            selected={props.structure}
            onSelect={props.selectStructure}
          />
          {info && (
            <>
              <button
                className="info-action"
                type="button"
                aria-label={`${positionLabel(props.position)} structure information`}
                onClick={() => props.setShowProtocolInfo((shown) => !shown)}
              >
                ⓘ
              </button>
              {props.showProtocolInfo && (
                <p className="protocol-info">{info}</p>
              )}
            </>
          )}
          {props.structure === "custom" && (
            <CustomTargets
              protocol={props.protocol as Protocol}
              targets={props.customTargets}
              setCount={props.setCustomSetCount}
              update={props.updateCustomTarget}
            />
          )}
          <FooterButton
            disabled={!props.structureValid}
            onClick={props.onStructureContinue}
          >
            CONTINUE
          </FooterButton>
        </Shell>
      );
    })();

  return (
    <Shell
      title="REVIEW ASSIGNMENT"
      subtitle={subtitle}
      onBack={props.onReviewBack}
    >
      <h2 className="review-exercise">{props.exercise}</h2>
      <dl className="review-list">
        <Review label="SLOT" value={subtitle} />
        <Review
          label="PROTOCOL"
          value={protocolLabel(props.protocol as Protocol)}
        />
        <Review label="TARGET STRUCTURE" value={formatTargets(props.targets)} />
        {props.assignment && (
          <Review
            label="EDIT"
            value="REPLACES CURRENT ASSIGNMENT; HISTORY PRESERVED"
          />
        )}
      </dl>
      {props.message && <p className="form-message">{props.message}</p>}
      <FooterButton disabled={props.saving} onClick={() => void props.save()}>
        {props.saving ? "SAVING" : "SAVE"}
      </FooterButton>
    </Shell>
  );
}

function CustomTargets({
  protocol,
  setCount,
  targets,
  update,
}: {
  protocol: Protocol;
  setCount: (count: number) => void;
  targets: DraftTarget[];
  update: Props["updateCustomTarget"];
}) {
  return (
    <div className="custom-sets">
      {protocol === "straight_set" && (
        <label className="set-count">
          SET COUNT
          <input
            id="custom-set-count"
            type="number"
            min="1"
            max="10"
            inputMode="numeric"
            value={targets.length}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </label>
      )}
      {targets.map((target, index) => (
        <div className="target-pair" key={index}>
          <p>SET {index + 1}</p>
          <label>
            MINIMUM
            <input
              id={`custom-min-${index}`}
              type="number"
              min="1"
              max="2147483647"
              inputMode="numeric"
              value={target.min}
              onChange={(event) => update(index, "min", event.target.value)}
            />
          </label>
          <label>
            MAXIMUM
            <input
              id={`custom-max-${index}`}
              type="number"
              min="1"
              max="2147483647"
              inputMode="numeric"
              value={target.max}
              onChange={(event) => update(index, "max", event.target.value)}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function formatTargets(targets: readonly TargetSet[]) {
  return targets.length
    ? targets
        .map(({ min, max }) => (min === max ? String(min) : `${min}–${max}`))
        .join(" + ")
    : "NOT APPLICABLE";
}

function protocolLabel(protocol: Protocol) {
  return protocol === "rest_pause"
    ? "REST-PAUSE"
    : protocol === "timed_hold"
      ? "TIMED HOLD"
      : "STRAIGHT SET";
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

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
