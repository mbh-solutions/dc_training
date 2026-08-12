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
import type { DraftTarget } from "./rotation-assignment-draft.js";
import { BackChevron } from "./HomeScreen.jsx";

const rotationStyles = `
.rotation-shell { display: flex; flex-direction: column; }
.flow-header { min-height: 102px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: start; padding: 22px 0 24px; text-align: center; }
.flow-header > div { grid-column: 2; }
.flow-header h1 { margin: 0; font-size: 1.55rem; }
.flow-header p { margin: 7px 0 0; color: var(--red); font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif; font-size: 1rem; letter-spacing: .08em; }
.back-action { grid-column: 1; grid-row: 1; width: 44px; min-height: 44px; display: grid; place-items: center; border: 0; padding: 0; color: var(--white); background: transparent; cursor: pointer; }
.rotation-label { margin: 20px 2px 10px; color: var(--red); }
.workout-group { display: grid; gap: 8px; margin-bottom: 12px; }
.workout-toggle { width: 100%; min-height: 64px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; color: var(--white); background: var(--panel); text-align: left; cursor: pointer; }
.workout-toggle .rotation-label { margin: 0; }
.workout-toggle small { display: block; margin-top: 4px; color: var(--gray); font-size: .7rem; }
.workout-toggle b { color: var(--red); font-size: 1.5rem; }
.workout-assignments { display: grid; gap: 8px; }
.workout-assignments[hidden] { display: none; }
.assignment-card, .choice-card, .review-list div { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(145deg, rgba(22,22,22,.9), rgba(11,11,11,.96)); }
.assignment-card { position: relative; width: 100%; min-height: 76px; display: grid; gap: 5px; border-color: #292927; padding: 14px 16px; color: var(--white); text-align: left; cursor: pointer; }
.assignment-card:disabled { cursor: wait; opacity: .6; }
.assignment-card span { color: var(--red); font-size: .78rem; }
.assignment-card strong { font-size: 1rem; }
.assignment-card small { color: var(--gray); font-size: .72rem; }
.choice-list { display: grid; gap: 11px; }
.choice-card { position: relative; min-height: 76px; display: flex; align-items: center; gap: 12px; padding: 16px 58px 16px 17px; cursor: pointer; }
.choice-card--selected { border-color: var(--red); }
.choice-card input { position: absolute; opacity: 0; }
.choice-card strong { font-size: 1.08rem; }
.choice-dot { position: absolute; right: 18px; width: 28px; height: 28px; border: 2px solid #747471; border-radius: 50%; }
.choice-card--selected .choice-dot { border: 5px solid #25100f; background: var(--red); box-shadow: 0 0 0 2px var(--red); }
.dc-badge { border: 1px solid var(--red); border-radius: 4px; padding: 4px 7px; color: var(--white); font-size: .72rem; }
.info-action { min-width: 44px; min-height: 44px; margin: -8px 0 12px; border: 1px solid var(--line); border-radius: 50%; color: var(--white); background: transparent; cursor: pointer; }
.info-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; background: rgba(0,0,0,.7); }
.info-sheet { width: 100%; max-width: 560px; margin: 0 auto; border: 1px solid var(--line); border-radius: 16px 16px 0 0; padding: 22px; background: var(--panel); }
.info-sheet-close { float: right; min-width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 1.8rem; cursor: pointer; }
.protocol-info { clear: both; margin: 20px 0; border-left: 2px solid var(--red); padding: 10px 14px; color: #bdbdba; line-height: 1.4; white-space: pre-line; }
.info-sheet-action { width: 100%; min-height: 52px; border: 0; border-radius: 6px; color: var(--white); background: var(--red); font-weight: 800; cursor: pointer; }
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

export type Props = {
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
  openWorkout: WorkoutSlot | null;
  onExerciseBack: () => void;
  onExerciseContinue: () => void;
  onProtocolBack: () => void;
  onProtocolContinue: () => void;
  onReviewBack: () => void;
  onStructureBack: () => void;
  onStructureContinue: () => void;
  position: AssignmentPosition;
  protocol: Protocol | "";
  replacement: boolean;
  save: () => Promise<void>;
  saved: Record<string, Assignment>;
  saving: boolean;
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
  toggleWorkout: (workout: WorkoutSlot) => void;
  updateCustomTarget: (
    index: number,
    field: keyof DraftTarget,
    value: string,
  ) => void;
};

export function ExerciseScreen(props: Props) {
  const subtitle = `${props.slot} · ${positionLabel(props.position)}`;
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
}

export function ProtocolScreen(props: Props) {
  const info = protocolInfo(props.position, props.exercise);
  return (
    <Shell
      title="SET PROTOCOL"
      subtitle={`${props.slot} · ${positionLabel(props.position)}`}
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
          <InfoSheet
            info={info}
            open={props.showProtocolInfo}
            onClose={() => props.setShowProtocolInfo(() => false)}
          />
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

export function StructureScreen(props: Props) {
  const info = props.availableStructures.find(
    (choice) => choice.value === props.structure,
  )?.info;
  return (
    <Shell
      title={
        props.protocol === "rest_pause" ? "SET TARGET RANGE" : "SET STRUCTURE"
      }
      subtitle={`${props.slot} · ${positionLabel(props.position)}`}
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
          <InfoSheet
            info={info}
            open={props.showProtocolInfo}
            onClose={() => props.setShowProtocolInfo(() => false)}
          />
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
}

export function ReviewScreen(props: Props) {
  const subtitle = `${props.slot} · ${positionLabel(props.position)}`;
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
        {(props.assignment || props.replacement) && (
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

function InfoSheet({
  info,
  onClose,
  open,
}: {
  info: string;
  onClose: () => void;
  open: boolean;
}) {
  if (!open) return null;
  return (
    <div className="info-backdrop">
      <section
        aria-label="PROTOCOL INFORMATION"
        aria-modal="true"
        className="info-sheet"
        role="dialog"
      >
        <button
          aria-label="CLOSE INFORMATION"
          className="info-sheet-close"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
        <p className="protocol-info">{info}</p>
        <button className="info-sheet-action" type="button" onClick={onClose}>
          GOT IT
        </button>
      </section>
    </div>
  );
}

export function SetupScreen(props: Props) {
  return (
    <Shell title="ROTATION SETUP" onBack={props.onBack}>
      {WORKOUT_SLOTS.map((workout) => {
        const positions = positionsFor(workout);
        const assigned = positions.filter(
          (bodyPart) => props.saved[assignmentKey(workout, bodyPart)],
        ).length;
        const expanded = props.openWorkout === workout;
        const panelId = `workout-${workout.toLowerCase()}-assignments`;

        return (
          <section className="workout-group" key={workout}>
            <button
              aria-controls={panelId}
              aria-expanded={expanded}
              className="workout-toggle"
              onClick={() => props.toggleWorkout(workout)}
              type="button"
            >
              <span>
                <span className="section-label rotation-label">
                  {workout} WORKOUT
                </span>
                <small>
                  {assigned} OF {positions.length} EXERCISES SET
                </small>
              </span>
              <b aria-hidden="true">{expanded ? "−" : "+"}</b>
            </button>
            <div
              className="workout-assignments"
              hidden={!expanded}
              id={panelId}
            >
              {positions.map((bodyPart) => {
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
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {props.message && <p className="form-message">{props.message}</p>}
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
            <BackChevron />
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
