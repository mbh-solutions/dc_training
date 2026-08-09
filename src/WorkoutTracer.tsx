import { useState } from "react";
import backIllustration from "../docs/design/back-stretch-illustration-approved.png";
import chestReference from "../docs/design/chest-stretch-info-approved.png";
import shoulderIllustration from "../docs/design/shoulder-stretch-illustration-approved.png";
import tricepsReference from "../docs/design/triceps-stretch-info-approved.png";
import {
  conversionPreview,
  displayBodyPart,
  repCount,
  setCount,
  type WeightEntry,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";

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
};

type Props = {
  lastOperationId: string | null;
  message: string;
  onExit: () => void;
  onSave: (
    step: WorkoutStep,
    status: "completed" | "skipped",
    weights?: WeightEntry[],
    reps?: number[],
  ) => Promise<boolean>;
  onUndo: () => Promise<void>;
  steps: WorkoutStep[];
  workout: Workout;
};

export function WorkoutTracer(props: Props) {
  const step = props.steps.find((item) => item.status === "pending");
  if (!step) return null;
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
            {props.workout.slot} <span>{exerciseNumber(step)} OF 5</span>
          </p>
        </div>
      </header>
      {props.lastOperationId && (
        <div className="undo-strip">
          SAVED
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
  step,
}: Props & { step: WorkoutStep }) {
  const weightsNeeded = setCount(step);
  const repsNeeded = repCount(step);
  const [weights, setWeights] = useState<WeightEntry[]>(
    Array.from({ length: weightsNeeded }, () => ({ amount: "", unit: "lb" })),
  );
  const [reps, setReps] = useState<string[]>(
    Array.from({ length: repsNeeded }, () => ""),
  );
  const [saving, setSaving] = useState(false);
  const valid =
    weights.every(({ amount }) => Number(amount) > 0) &&
    reps.every((value) => Number.isInteger(Number(value)) && Number(value) > 0);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const saved = await onSave(step, "completed", weights, reps.map(Number));
    if (!saved) setSaving(false);
  };

  return (
    <main className="workout-main">
      <p className="workout-part">{displayBodyPart(step.body_part)}</p>
      <h1>{step.exercise}</h1>
      <section className="previous-card">
        <p>PREVIOUS PERFORMANCE</p>
        <strong>NO PREVIOUS PERFORMANCE</strong>
      </section>
      <p className="today-label">TODAY</p>
      <div className="entry-list">
        {weights.map((weight, index) => (
          <section className="entry-card" key={index}>
            <p>
              {step.protocol === "rest_pause" ? "WORK SET" : `SET ${index + 1}`}
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
            <div className="rep-entry">
              {repIndexes(step, index).map((repIndex) => (
                <label key={repIndex}>
                  {step.protocol === "rest_pause"
                    ? `MINI ${repIndex + 1}`
                    : "REPS"}
                  <input
                    aria-label={`REP ${repIndex + 1}`}
                    id={`rep-${repIndex}`}
                    inputMode="numeric"
                    placeholder="0"
                    value={reps[repIndex]}
                    onChange={(event) =>
                      setReps((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === repIndex ? event.target.value : value,
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
        className="text-action skip-action"
        disabled={saving}
        type="button"
        onClick={() => void onSave(step, "skipped")}
      >
        SKIP
      </button>
    </main>
  );
}

function StretchEntry({
  message,
  onSave,
  step,
}: Props & { step: WorkoutStep }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const detail = stretchDetails[step.body_part];
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
        type="button"
        onClick={() => void onSave(step, "completed")}
      >
        STRETCH COMPLETE
      </button>
      <button
        className="text-action skip-action"
        type="button"
        onClick={() => void onSave(step, "skipped")}
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
  onDone,
  workout,
}: {
  onDone: () => void;
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
        <b>B1</b>
      </section>
      <button className="primary-action" type="button" onClick={onDone}>
        DONE
      </button>
    </div>
  );
}

function repIndexes(step: WorkoutStep, setIndex: number) {
  return step.protocol === "rest_pause" ? [0, 1, 2] : [setIndex];
}

function exerciseNumber(step: WorkoutStep) {
  if (step.body_part === "chest") return 1;
  if (step.body_part === "shoulders") return 2;
  if (step.body_part === "triceps") return 3;
  if (step.body_part === "back_width") return 4;
  return 5;
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
.today-label { margin-top: 30px; }
.entry-list { display: grid; gap: 14px; }
.weight-entry { display: grid; grid-template-columns: 1fr 82px; gap: 8px; }
.weight-entry input, .weight-entry select, .rep-entry input { min-height: 58px; border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; color: var(--white); background: var(--panel); font-family: Impact, sans-serif; font-size: 1.55rem; }
.conversion-preview { display: block; margin-top: 6px; color: var(--gray); text-align: right; }
.rep-entry { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.rep-entry label { color: var(--gray); font-size: .72rem; text-align: center; }
.rep-entry input { width: 100%; margin-top: 6px; text-align: center; }
.skip-action { display: block; margin: 10px auto 0; }
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
.workout-complete .primary-action { margin-top: auto; }
`;
