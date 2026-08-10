import { useState } from "react";
import type { WorkoutSlot } from "./rotation-config.js";
import {
  workoutEntryShape,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";
import { conversionPreview, type WeightEntry } from "./weight-conversion.js";

const backIllustration = new URL(
  "../docs/design/back-stretch-illustration-approved.png",
  import.meta.url,
).href;
const chestReference = new URL(
  "../docs/design/chest-stretch-info-approved.png",
  import.meta.url,
).href;
const bicepsIllustration = new URL(
  "../docs/design/biceps-stretch-illustration-approved.png",
  import.meta.url,
).href;
const hamstringIllustration = new URL(
  "../docs/design/hamstring-stretch-illustration-approved.png",
  import.meta.url,
).href;
const quadIllustration = new URL(
  "../docs/design/quad-stretch-illustration-approved.png",
  import.meta.url,
).href;
const shoulderIllustration = new URL(
  "../docs/design/shoulder-stretch-illustration-approved.png",
  import.meta.url,
).href;
const tricepsReference = new URL(
  "../docs/design/triceps-stretch-info-approved.png",
  import.meta.url,
).href;

const stretchDetails: Record<
  string,
  { copy: string[]; image: string; name: string; reference?: boolean }
> = {
  chest: {
    copy: [
      "Use a bent-arm fly position.",
      "Keep back on bench, hips off edge, and chest high.",
      "Hold a safe, controlled stretch for 60–90 seconds.",
      "Stop for shoulder or joint pain.",
    ],
    image: chestReference,
    name: "LOADED FLY STRETCH",
    reference: true,
  },
  shoulders: {
    copy: [
      "Set bar at shoulder height.",
      "Face away. Grip bar behind you, palms up.",
      "Sink down into the stretch.",
      "Roll shoulders down.",
      "Hold 60–90 seconds.",
      "Stop for joint pain.",
    ],
    image: shoulderIllustration,
    name: "BEHIND-BACK BAR STRETCH",
  },
  triceps: {
    copy: [
      "Sit with back supported.",
      "Lower one dumbbell behind your head.",
      "Keep elbow pointed up.",
      "Lean back slightly. Use the back of your head to gently deepen the stretch.",
      "Hold 60–90 seconds.",
      "Stop for joint pain.",
    ],
    image: tricepsReference,
    name: "ONE-ARM OVERHEAD STRETCH",
    reference: true,
  },
  biceps: {
    copy: [
      "Set bar around neck height.",
      "Face away. Grip bar behind you, palms down.",
      "Sink down into the stretch.",
      "Hold 45–60 seconds.",
      "Stop for joint pain.",
    ],
    image: bicepsIllustration,
    name: "BEHIND-BACK BAR STRETCH",
  },
  back: {
    copy: [
      "Grip a fixed bar at chest height.",
      "Keep your arms straight.",
      "Sit your hips back.",
      "Round your upper back and pull away.",
      "Hold 45–60 seconds.",
      "Stop for shoulder or joint pain.",
    ],
    image: backIllustration,
    name: "STATIONARY ROUNDED-BACK PULL",
  },
  hamstrings: {
    copy: [
      "Place one heel on a high fixed bar.",
      "Hold your toe.",
      "Use your free hand to keep the leg straight.",
      "Hinge forward into the stretch.",
      "Hold 60 seconds.",
      "Stop for joint pain.",
    ],
    image: hamstringIllustration,
    name: "ELEVATED STRAIGHT-LEG STRETCH",
  },
  quadriceps: {
    copy: [
      "Grip a fixed bar in front of you.",
      "Keep your knees off the floor.",
      "Drive knees and hips forward.",
      "Lean back into the stretch.",
      "Hold 45–60 seconds.",
      "Stop for knee or joint pain.",
    ],
    image: quadIllustration,
    name: "SUPPORTED QUAD STRETCH",
  },
};

type Props = {
  lastOperationId: string | null;
  lastOperationStatus: "completed" | "skipped" | null;
  message: string;
  onExit: () => void;
  onSave: (
    step: WorkoutStep,
    weights?: WeightEntry[],
    reps?: number[],
    durationSeconds?: number | null,
  ) => Promise<boolean>;
  onSkip: (step: WorkoutStep) => Promise<boolean>;
  onUndo: () => Promise<void>;
  steps: WorkoutStep[];
  workout: Workout;
};

export function WorkoutTracer(props: Props) {
  const step = props.steps.find((item) => item.status === "pending");
  if (!step) return <WorkoutLoadError {...props} />;
  const progress = workoutProgress(props.steps, step);
  return (
    <div className="app-shell workout-shell">
      <style>{workoutStyles}</style>
      <header className="workout-header">
        <button aria-label="LEAVE WORKOUT" type="button" onClick={props.onExit}>
          ‹
        </button>
        <div>
          <strong>DC TRAINING</strong>
          <p>
            {props.workout.slot}{" "}
            <span>
              {progress.current} OF {progress.total}
            </span>
          </p>
        </div>
      </header>
      {props.lastOperationId && (
        <div className="undo-strip">
          {props.lastOperationStatus === "skipped" ? "SKIPPED" : "SAVED"}
          <button type="button" onClick={() => void props.onUndo()}>
            UNDO
          </button>
        </div>
      )}
      {step.kind === "exercise" ? (
        <ExerciseEntry key={step.step_id} {...props} step={step} />
      ) : (
        <StretchEntry key={step.step_id} {...props} step={step} />
      )}
    </div>
  );
}

function ExerciseEntry({
  message,
  onSave,
  onSkip,
  step,
}: Props & { step: WorkoutStep }) {
  const shape = workoutEntryShape(step);
  const [weights, setWeights] = useState<WeightEntry[]>(
    Array.from({ length: shape.weightCount }, () => ({
      amount: "",
      unit: "lb",
    })),
  );
  const [values, setValues] = useState<string[]>(
    Array.from({ length: shape.valueCount }, () => ""),
  );
  const [saving, setSaving] = useState(false);
  const [calfInfoOpen, setCalfInfoOpen] = useState(false);
  const valid =
    weights.every((entry) => conversionPreview(entry) !== "") &&
    values.every(
      (value) => Number.isInteger(Number(value)) && Number(value) > 0,
    );

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const saved = await onSave(
      step,
      weights,
      shape.metric === "reps" ? values.map(Number) : [],
      shape.metric === "seconds" ? Number(values[0]) : null,
    );
    if (!saved) setSaving(false);
  };

  const skip = async () => {
    setSaving(true);
    if (!(await onSkip(step))) setSaving(false);
  };

  return (
    <main className="workout-main">
      <p className="workout-part">{displayBodyPart(step.body_part)}</p>
      <h1>{step.exercise}</h1>
      <PreviousPerformance step={step} />
      <p className="today-label">TODAY</p>
      <div className="entry-list">
        {weights.map((weight, index) => (
          <section className="entry-card" key={index}>
            <p>
              {step.protocol === "rest_pause" ? "WORK SET" : `SET ${index + 1}`}
              {step.body_part === "calves" &&
                step.structure === "single-10-12" &&
                index === 0 && (
                  <button
                    aria-label="CALF 10–12 INFORMATION"
                    className="entry-info"
                    type="button"
                    onClick={() => setCalfInfoOpen(true)}
                  >
                    ⓘ
                  </button>
                )}
            </p>
            <div className="weight-entry">
              <input
                aria-label={`SET ${index + 1} WEIGHT`}
                id={`weight-${index}`}
                inputMode="decimal"
                placeholder="0"
                value={weight.amount}
                onChange={(event) =>
                  setWeights((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, amount: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <select
                aria-label={`SET ${index + 1} WEIGHT UNIT`}
                value={weight.unit}
                onChange={(event) =>
                  setWeights((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            unit: event.target.value as WeightEntry["unit"],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="lb">LB</option>
                <option value="kg">KG</option>
              </select>
            </div>
            {conversionPreview(weight) && (
              <small className="conversion-preview">
                {conversionPreview(weight)}
              </small>
            )}
            <div
              className={`rep-entry ${shape.valueCount === 1 ? "rep-entry--single" : ""}`}
            >
              {valueIndexes(step, index).map((valueIndex) => (
                <label key={valueIndex}>
                  {shape.metric === "seconds"
                    ? "HOLD SECONDS"
                    : step.protocol === "rest_pause"
                      ? `MINI ${valueIndex + 1}`
                      : "REPS"}
                  <input
                    aria-label={
                      shape.metric === "seconds"
                        ? "HOLD SECONDS"
                        : `REP ${valueIndex + 1}`
                    }
                    id={
                      shape.metric === "seconds"
                        ? "duration-seconds"
                        : `rep-${valueIndex}`
                    }
                    inputMode="numeric"
                    placeholder="0"
                    value={values[valueIndex]}
                    onChange={(event) =>
                      setValues((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === valueIndex ? event.target.value : value,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      {message && <p className="form-message">{message}</p>}
      <button
        className="primary-action"
        disabled={!valid || saving}
        type="button"
        onClick={() => void save()}
      >
        {saving ? "SAVING" : "SAVE & NEXT"}
      </button>
      <button
        className="secondary-action skip-action"
        disabled={saving}
        type="button"
        onClick={() => void skip()}
      >
        SKIP
      </button>
      {calfInfoOpen && (
        <InformationDialog
          label="CALF 10–12 INFORMATION"
          lines={calfInstructions}
          title="DC CALF REP"
          onClose={() => setCalfInfoOpen(false)}
        />
      )}
    </main>
  );
}

function PreviousPerformance({ step }: { step: WorkoutStep }) {
  const hasPrevious = step.previous_weight_entries.length > 0;
  return (
    <section className="previous-card">
      <p>PREVIOUS PERFORMANCE</p>
      {!hasPrevious ? (
        <strong>NO PREVIOUS PERFORMANCE</strong>
      ) : (
        <div className="previous-list">
          {step.previous_weight_entries.map((weight, index) => (
            <output key={index}>
              <b>{entryLabel(step, index)}</b>
              <span>{previousValue(step, weight, index)}</span>
            </output>
          ))}
        </div>
      )}
    </section>
  );
}

function StretchEntry({
  message,
  onSave,
  onSkip,
  step,
}: Props & { step: WorkoutStep }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const detail = stretchDetails[step.body_part];
  const complete = async () => {
    setSaving(true);
    if (!(await onSave(step))) setSaving(false);
  };
  const skip = async () => {
    setSaving(true);
    if (!(await onSkip(step))) setSaving(false);
  };
  return (
    <main className="workout-main stretch-main">
      <p className="workout-part">{displayBodyPart(step.body_part)} COMPLETE</p>
      <h1>EXTREME STRETCH</h1>
      <section className="stretch-card">
        <h2>{detail.name}</h2>
        <div className="stretch-meta">
          <span>DC</span>
          <button
            aria-label="STRETCH INFORMATION"
            type="button"
            onClick={() => setInfoOpen(true)}
          >
            ⓘ
          </button>
        </div>
        <div
          className={`stretch-image ${detail.reference ? "stretch-image--reference" : ""}`}
        >
          <img
            alt={`${displayBodyPart(step.body_part)} stretch position`}
            src={detail.image}
          />
        </div>
      </section>
      {message && <p className="form-message">{message}</p>}
      <button
        className="primary-action"
        disabled={saving}
        type="button"
        onClick={() => void complete()}
      >
        {saving ? "SAVING" : "STRETCH COMPLETE"}
      </button>
      <button
        className="secondary-action skip-action"
        disabled={saving}
        type="button"
        onClick={() => void skip()}
      >
        SKIP
      </button>
      {infoOpen && (
        <div className="stretch-dialog-backdrop">
          <section
            aria-label="DC STRETCH INFORMATION"
            aria-modal="true"
            className="stretch-dialog"
            role="dialog"
          >
            <button
              aria-label="CLOSE STRETCH INFORMATION"
              className="dialog-close"
              type="button"
              onClick={() => setInfoOpen(false)}
            >
              ×
            </button>
            <h2>
              <span>DC</span> DC {displayBodyPart(step.body_part)} STRETCH
            </h2>
            {detail.copy.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <button
              className="primary-action"
              type="button"
              onClick={() => setInfoOpen(false)}
            >
              GOT IT
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export function WorkoutComplete({
  lastOperationStatus,
  nextSlot,
  onDone,
  onUndo,
  workout,
}: {
  lastOperationStatus: "completed" | "skipped" | null;
  nextSlot: WorkoutSlot;
  onDone: () => void;
  onUndo: () => Promise<void>;
  workout: Workout;
}) {
  return (
    <div className="app-shell workout-complete">
      <style>{workoutStyles}</style>
      <strong>DC TRAINING</strong>
      <div className="complete-check">✓</div>
      <h1>{workout.slot} COMPLETE</h1>
      <section>
        <p>NEXT WORKOUT</p>
        <b>{nextSlot}</b>
      </section>
      {lastOperationStatus && (
        <button
          className="secondary-action complete-undo"
          type="button"
          onClick={() => void onUndo()}
        >
          {lastOperationStatus === "skipped" ? "UNDO SKIP" : "UNDO LAST SAVE"}
        </button>
      )}
      <button className="primary-action" type="button" onClick={onDone}>
        DONE
      </button>
    </div>
  );
}

function valueIndexes(step: WorkoutStep, setIndex: number) {
  if (step.protocol === "rest_pause") return [0, 1, 2];
  if (step.protocol === "timed_hold") return [0];
  return [setIndex];
}

function workoutProgress(steps: WorkoutStep[], step: WorkoutStep) {
  const exercises = steps.filter((item) => item.kind === "exercise");
  return {
    current: exercises.filter((item) => item.ordinal <= step.ordinal).length,
    total: exercises.length,
  };
}

function entryLabel(step: WorkoutStep, index: number) {
  if (step.protocol === "rest_pause") return "WORK SET";
  if (step.protocol === "timed_hold") return "TIMED HOLD";
  return `SET ${index + 1}`;
}

function previousValue(step: WorkoutStep, weight: WeightEntry, index: number) {
  const load = `${weight.amount} ${weight.unit.toUpperCase()}`;
  if (step.protocol === "timed_hold")
    return `${load} · ${step.previous_duration_seconds} SECONDS`;
  if (step.protocol === "rest_pause")
    return `${load} · ${step.previous_reps.join(" / ")} REPS`;
  return `${load} · ${step.previous_reps[index]} REPS`;
}

function displayBodyPart(bodyPart: string) {
  return bodyPart.replaceAll("_", " ").toUpperCase();
}

const calfInstructions = [
  "Lower slowly over 5 seconds.",
  "Hold the bottom position for 15 seconds.",
  "Explode upward onto your toes.",
];

function InformationDialog({
  label,
  lines,
  onClose,
  title,
}: {
  label: string;
  lines: string[];
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="stretch-dialog-backdrop">
      <section
        aria-label={label}
        aria-modal="true"
        className="stretch-dialog"
        role="dialog"
      >
        <button
          aria-label={`CLOSE ${label}`}
          className="dialog-close"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
        <h2>
          <span>DC</span> {title}
        </h2>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <button className="primary-action" type="button" onClick={onClose}>
          GOT IT
        </button>
      </section>
    </div>
  );
}

const workoutStyles = `
.workout-shell { padding-top: max(18px, env(safe-area-inset-top)); }
.workout-header { min-height: 92px; display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; border-bottom: 1px solid var(--line); text-align: center; }
.workout-header > button { min-width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 3rem; cursor: pointer; }
.workout-header strong { font-family: Impact, sans-serif; font-size: 1.25rem; letter-spacing: .08em; }
.workout-header p { margin: 7px 0 0; font-family: Impact, sans-serif; font-size: 1.15rem; }
.workout-header span, .workout-part, .today-label { color: var(--red); }
.undo-strip { display: flex; justify-content: space-between; align-items: center; min-height: 44px; margin-top: 12px; border: 1px solid var(--red); border-radius: 6px; padding: 6px 12px; color: var(--white); font-family: Impact, sans-serif; }
.undo-strip button { min-height: 32px; border: 0; color: var(--red); background: transparent; cursor: pointer; }
.workout-main { padding: 32px 3px 24px; }
.workout-part, .today-label { margin: 0 0 10px; font-family: Impact, sans-serif; font-size: 1.25rem; letter-spacing: .08em; }
.workout-main > h1 { margin: 0 0 28px; font-size: clamp(2.4rem, 11vw, 4rem); text-transform: uppercase; }
.previous-card, .entry-card, .stretch-card, .workout-complete section { border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: linear-gradient(145deg, rgba(22,22,22,.88), rgba(8,8,8,.96)); }
.previous-card p, .entry-card > p, .workout-complete section p { margin: 0 0 13px; color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .06em; }
.previous-card strong { color: var(--gray); }
.previous-list { display: grid; gap: 10px; }
.previous-list output { display: flex; justify-content: space-between; gap: 12px; color: var(--gray); }
.previous-list b { color: var(--white); }
.today-label { margin-top: 30px; }
.entry-list { display: grid; gap: 14px; }
.weight-entry { display: grid; grid-template-columns: 1fr 82px; gap: 8px; }
.weight-entry input, .weight-entry select, .rep-entry input { min-height: 58px; border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; color: var(--white); background: var(--panel); font-family: Impact, sans-serif; font-size: 1.55rem; }
.conversion-preview { display: block; margin-top: 6px; color: var(--gray); text-align: right; }
.rep-entry { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.rep-entry--single { grid-template-columns: 1fr; }
.rep-entry label { color: var(--gray); font-size: .72rem; text-align: center; }
.rep-entry input { width: 100%; margin-top: 6px; text-align: center; }
.skip-action { display: block; margin: 10px auto 0; }
.entry-card > p { display: flex; justify-content: space-between; align-items: center; }
.entry-info { min-width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 1.5rem; cursor: pointer; }
.stretch-card { border-color: var(--red); }
.stretch-card h2 { margin: 0 0 12px; font-size: 1.7rem; }
.stretch-meta { display: flex; align-items: center; gap: 12px; }
.stretch-meta span, .stretch-dialog h2 span { border: 1px solid var(--red); border-radius: 5px; padding: 5px 8px; }
.stretch-meta button { min-width: 44px; min-height: 44px; border: 0; color: var(--white); background: transparent; font-size: 1.7rem; cursor: pointer; }
.stretch-image { height: 270px; margin-top: 10px; overflow: hidden; }
.stretch-image img { width: 100%; height: 100%; object-fit: contain; }
.stretch-image--reference img { width: 150%; height: 240%; margin: -64% 0 0 -25%; object-fit: cover; }
.stretch-dialog-backdrop { position: fixed; inset: 0; z-index: 30; display: flex; align-items: flex-end; background: rgba(0,0,0,.72); }
.stretch-dialog { width: min(100%, 520px); max-height: 85svh; overflow: auto; margin: 0 auto; border: 1px solid var(--line); border-radius: 18px 18px 0 0; padding: 24px; background: #111; }
.dialog-close { float: right; min-width: 44px; min-height: 44px; border: 0; color: var(--gray); background: transparent; font-size: 2rem; cursor: pointer; }
.stretch-dialog h2 { clear: both; color: var(--red); }
.stretch-dialog p { color: #d4d4d1; font-size: 1.05rem; line-height: 1.4; }
.workout-complete { min-height: 100svh; display: flex; flex-direction: column; align-items: center; padding-top: max(100px, env(safe-area-inset-top)); text-align: center; }
.workout-complete > strong { font-family: Impact, sans-serif; font-size: 1.45rem; letter-spacing: .08em; }
.complete-check { display: grid; width: 126px; height: 126px; place-items: center; margin: 72px 0 32px; border: 3px solid var(--red); border-radius: 50%; font-size: 5rem; }
.workout-complete h1 { margin: 0 0 36px; font-size: clamp(3rem, 15vw, 5rem); }
.workout-complete section { width: 100%; text-align: left; }
.workout-complete section b { font-family: Impact, sans-serif; font-size: 4rem; }
.workout-complete .complete-undo { margin-top: 18px; }
.workout-complete .primary-action { margin-top: auto; }
`;

function WorkoutLoadError({ message, onExit }: Props) {
  return (
    <main className="app-shell workout-shell workout-load-error">
      <style>{workoutStyles}</style>
      <h1>WORKOUT COULD NOT BE LOADED</h1>
      <p>{message || "WORKOUT STEPS COULD NOT BE LOADED"}</p>
      <button type="button" onClick={() => window.location.reload()}>
        RETRY
      </button>
      <button type="button" onClick={onExit}>
        LEAVE WORKOUT
      </button>
    </main>
  );
}
