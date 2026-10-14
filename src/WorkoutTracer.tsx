import { Dialog } from "./Dialog.jsx";
import { useWorkoutDraft } from "./hooks/use-workout-draft.js";
import { validPerformanceInteger } from "./workout-domain.js";
import { useState } from "react";
import type { WorkoutSlot } from "./rotation-config.js";
import {
  workoutEntryShape,
  type Workout,
  type WorkoutStep,
} from "./workout-domain.js";
import {
  conversionPreview,
  displayWeight,
  type WeightEntry,
  type WeightUnit,
} from "./weight-conversion.js";
import { BackChevron } from "./HomeScreen.jsx";

const backIllustration = new URL(
  "../docs/design/back-stretch-illustration-approved.png",
  import.meta.url,
).href;
const chestIllustration = new URL(
  "../docs/design/chest-stretch-illustration-approved.png",
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
const tricepsIllustration = new URL(
  "../docs/design/triceps-stretch-illustration-approved.png",
  import.meta.url,
).href;

const stretchDetails: Record<
  string,
  { copy: string[]; image: string; name: string }
> = {
  chest: {
    copy: [
      "Use a bent-arm fly position.",
      "Keep back on bench, hips off edge, and chest high.",
      "Hold a safe, controlled stretch for 60–90 seconds.",
      "Stop for shoulder or joint pain.",
    ],
    image: chestIllustration,
    name: "LOADED FLY STRETCH",
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
    image: tricepsIllustration,
    name: "ONE-ARM OVERHEAD STRETCH",
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
  draftScope?: string;
  actionSaving: boolean;
  blockingStep: WorkoutStep | null;
  lastOperationId: string | null;
  lastOperationStatus: "baseline" | "completed" | "skipped" | "win" | null;
  message: string;
  onBeginReplacement: (step: WorkoutStep) => void;
  onExit: () => void;
  onResolveAction: (
    step: WorkoutStep,
    action: "count_failure" | "count_win" | "use_mulligan",
  ) => Promise<boolean>;
  onSave: (
    step: WorkoutStep,
    weights?: WeightEntry[],
    reps?: number[],
    durationSeconds?: number | null,
  ) => Promise<boolean>;
  onCorrect: Props["onSave"];
  onSkip: (step: WorkoutStep) => Promise<boolean>;
  onUndo: () => Promise<void>;
  steps: WorkoutStep[];
  weightUnit: WeightUnit;
  workout: Workout;
};

export function WorkoutTracer(props: Props) {
  const [viewedStepId, setViewedStepId] = useState<string | null>(null);
  const pendingStep = props.steps.find((item) => item.status === "pending");
  const viewedStep = props.steps.find(
    (item) => item.step_id === viewedStepId && item.status !== "pending",
  );
  const step = viewedStep ?? pendingStep ?? props.blockingStep;
  if (!step) return <WorkoutLoadError {...props} />;
  const progress = workoutProgress(props.steps, step);
  return (
    <div className="app-shell workout-shell">
      <style>{workoutStyles}</style>
      <header className="workout-header">
        <button aria-label="LEAVE WORKOUT" type="button" onClick={props.onExit}>
          <BackChevron />
        </button>
        <div>
          <strong>DC TRAINING LOG</strong>
          <p>
            {props.workout.slot}{" "}
            <span>
              {progress.current} OF {progress.total}
            </span>
          </p>
        </div>
      </header>
      {props.lastOperationId && !props.blockingStep && (
        <div className="undo-strip">
          {operationLabel(props.lastOperationStatus)}
          <button type="button" onClick={() => void props.onUndo()}>
            UNDO
          </button>
        </div>
      )}
      <WorkoutNavigation
        {...props}
        step={step}
        reviewing={!!viewedStep}
        setViewedStepId={setViewedStepId}
      />
      {viewedStep && (
        <ExerciseEntry
          key={`review:${viewedStep.step_id}`}
          {...props}
          step={viewedStep}
          onSave={async (...args) => {
            const saved = await props.onCorrect(...args);
            if (saved) setViewedStepId(null);
            return saved;
          }}
        />
      )}
      <div hidden={!!viewedStep}>
        <CurrentWorkoutEntry {...props} step={pendingStep} />
      </div>
      {props.blockingStep && (
        <LogbookPrompt
          message={props.message}
          saving={props.actionSaving}
          step={props.blockingStep}
          onReplace={() => props.onBeginReplacement(props.blockingStep!)}
          onResolve={(action) =>
            props.onResolveAction(props.blockingStep!, action)
          }
          onUndo={props.lastOperationId ? props.onUndo : undefined}
          weightUnit={props.weightUnit}
        />
      )}
    </div>
  );
}

function CurrentWorkoutEntry(props: Props & { step?: WorkoutStep }) {
  if (!props.step)
    return (
      <main className="workout-main">
        <h1>RESULT SAVED</h1>
      </main>
    );
  if (props.step.kind === "exercise")
    return (
      <ExerciseEntry key={props.step.step_id} {...props} step={props.step} />
    );
  return <StretchEntry key={props.step.step_id} {...props} step={props.step} />;
}

function WorkoutNavigation({
  actionSaving,
  blockingStep,
  steps,
  step,
  reviewing,
  setViewedStepId,
}: Pick<Props, "actionSaving" | "blockingStep" | "steps"> & {
  step: WorkoutStep;
  reviewing: boolean;
  setViewedStepId: (id: string | null) => void;
}) {
  return (
    <nav className="exercise-navigation" aria-label="Workout exercises">
      <button
        className="secondary-action"
        type="button"
        disabled={
          actionSaving ||
          !!blockingStep ||
          !steps.some(
            (item) => item.kind === "exercise" && item.ordinal < step.ordinal,
          )
        }
        onClick={() =>
          setViewedStepId(
            steps
              .filter(
                (item) =>
                  item.kind === "exercise" && item.ordinal < step.ordinal,
              )
              .at(-1)?.step_id ?? null,
          )
        }
      >
        PREVIOUS EXERCISE
      </button>
      {reviewing && (
        <button
          className="secondary-action"
          type="button"
          onClick={() => setViewedStepId(null)}
        >
          RETURN TO CURRENT
        </button>
      )}
    </nav>
  );
}

function ExerciseEntry({
  draftScope,
  message,
  onSave,
  onSkip,
  step,
  weightUnit,
}: Props & { step: WorkoutStep }) {
  const shape = workoutEntryShape(step);
  const { weights, values, setWeights, setValues, clear, notice } =
    useWorkoutDraft(
      `dc-workout-draft:${draftScope ?? step.workout_id}:${step.ordinal}`,
      () => ({
        weights: Array.from({ length: shape.weightCount }, (_, index) => {
          const weight =
            step.weight_entries[index] ?? step.previous_weight_entries[index];
          return weight
            ? displayWeight(weight, weightUnit)
            : { amount: "", unit: weightUnit };
        }),
        values: Array.from({ length: shape.valueCount }, (_, index) =>
          shape.metric === "seconds"
            ? String(step.duration_seconds ?? "")
            : String(step.reps[index] ?? ""),
        ),
      }),
      step.status === "pending",
    );
  const [saving, setSaving] = useState(false);
  const [calfInfoOpen, setCalfInfoOpen] = useState(false);
  const valid =
    weights.every((entry) => conversionPreview(entry) !== "") &&
    values.every((value) => validPerformanceInteger(Number(value)));

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const saved = await onSave(
      step,
      weights.map((entry, index) => {
        const original =
          step.weight_entries[index] ?? step.previous_weight_entries[index];
        const displayed = original ? displayWeight(original, weightUnit) : null;
        if (
          original &&
          entry.amount === displayed?.amount &&
          (entry.kind ?? "weight") === (original.kind ?? "weight")
        )
          return original;
        return {
          amount: entry.amount,
          unit: entry.unit,
          ...(entry.kind ? { kind: entry.kind } : {}),
        };
      }),
      shape.metric === "reps" ? values.map(Number) : [],
      shape.metric === "seconds" ? Number(values[0]) : null,
    );
    if (saved) clear();
    else setSaving(false);
  };

  const skip = async () => {
    setSaving(true);
    if (await onSkip(step)) clear();
    else setSaving(false);
  };

  return (
    <main className="workout-main">
      <p className="workout-part">{displayBodyPart(step.body_part)}</p>
      <h1>
        {step.exercise?.replace("Lying Deltech leg curl", "Lying leg curl")}
      </h1>
      <Prescription step={step} />
      {step.status === "skipped" && (
        <p>SKIPPED · Return to the current exercise to continue.</p>
      )}
      {step.mulligan_used && <p className="mulligan-badge">MULLIGAN USED</p>}
      <PreviousPerformance step={step} weightUnit={weightUnit} />
      <details className="logbook-method">
        <summary>How the logbook compares results</summary>
        <p>
          Weighted reps use estimated 1RM: weight × (1 + reps ÷ 30). Rest-pause
          uses total reps. This is a comparison score, not a tested maximum.
          Body weight, bar and band compare reps within the same load type;
          timed holds compare load and seconds. Changing load type starts a new
          baseline.
        </p>
      </details>

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
            <label className="load-kind-label">
              LOAD TYPE
              <select
                aria-label={`SET ${index + 1} LOAD TYPE`}
                value={weight.kind ?? "weight"}
                onChange={(event) =>
                  setWeights((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            kind: event.target.value as WeightEntry["kind"],
                            amount: event.target.value === "weight" ? "" : "0",
                            unit: weightUnit,
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="weight">Weight</option>
                <option value="body_weight">Body weight</option>
                <option value="bar">Bar</option>
                <option value="band">Band</option>
              </select>
            </label>
            {(!weight.kind || weight.kind === "weight") && (
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
                <span className="weight-unit">{weight.unit.toUpperCase()}</span>
              </div>
            )}
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
                      ? `RP${valueIndex + 1}`
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
      <EntryFeedback
        step={step}
        values={values}
        weights={weights}
        weightUnit={weightUnit}
      />
      {message && <p className="form-message">{message}</p>}
      <ExerciseSaveControls
        status={step.status}
        valid={valid}
        saving={saving}
        save={save}
        skip={skip}
      />
      {notice && (
        <p className="draft-notice" role="status">
          {notice}
        </p>
      )}
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

function ExerciseSaveControls({
  status,
  valid,
  saving,
  save,
  skip,
}: {
  status: WorkoutStep["status"];
  valid: boolean;
  saving: boolean;
  save: () => Promise<void>;
  skip: () => Promise<void>;
}) {
  return (
    <>
      <button
        className="primary-action"
        disabled={!valid || saving || status === "skipped"}
        type="button"
        onClick={() => void save()}
      >
        {saving
          ? "SAVING"
          : status === "pending"
            ? "SAVE & NEXT"
            : "SAVE CHANGES"}
      </button>
      {status === "pending" && (
        <button
          className="secondary-action skip-action"
          disabled={saving}
          type="button"
          onClick={() => void skip()}
        >
          SKIP
        </button>
      )}
    </>
  );
}

function Prescription({ step }: { step: WorkoutStep }) {
  const label =
    step.protocol === "rest_pause"
      ? "REST-PAUSE"
      : step.protocol === "timed_hold"
        ? "TIMED HOLD"
        : "STRAIGHT SET";
  const range = (target: { min: number; max: number }) =>
    target.min === target.max ? `${target.min}` : `${target.min}–${target.max}`;
  return (
    <section className="prescription" aria-label="Exercise prescription">
      <strong>{label}</strong>
      {step.protocol === "rest_pause" ? (
        <p>
          {step.target_sets[0] ? range(step.target_sets[0]) : "UNSPECIFIED"}{" "}
          TOTAL REPS
        </p>
      ) : step.target_sets.length ? (
        step.target_sets.map((target, index) => (
          <p key={index}>
            SET {index + 1}: {range(target)} REPS
          </p>
        ))
      ) : (
        <p>
          {step.protocol === "timed_hold"
            ? "LOG HOLD TIME IN SECONDS"
            : "1 SET · NO REP TARGET SELECTED"}
        </p>
      )}
    </section>
  );
}

function PreviousPerformance({
  step,
  weightUnit,
}: {
  step: WorkoutStep;
  weightUnit: WeightUnit;
}) {
  const hasPrevious = step.previous_weight_entries.length > 0;
  if (step.fresh_baseline && step.reference_history.length > 0) {
    const sameAssignment = step.reference_history.some(
      (retired) => retired.assignment_id === step.assignment_id,
    );
    return (
      <section className="previous-card fresh-baseline-card">
        <p>
          {sameAssignment
            ? "NEW BLAST / FRESH BASELINE"
            : "REASSIGNED / FRESH BASELINE"}
        </p>
        <strong>PRIOR HISTORY PRESERVED</strong>
        <div className="retired-history">
          {step.reference_history.map((retired) => (
            <div
              className="retired-performance"
              key={`${retired.assignment_id}:${retired.performed_at}`}
            >
              <div className="retired-performance-heading">
                <time dateTime={retired.performed_at}>
                  {retired.performed_at.slice(0, 10)}
                </time>
                <span>{retired.verdict?.toUpperCase() ?? "BASELINE"}</span>
              </div>
              <div className="previous-list">
                {retired.weight_entries.map((weight, index) => (
                  <output key={index}>
                    <b>{entryLabel(retired.protocol, index)}</b>
                    <span>
                      {performanceValue(
                        retired.protocol,
                        weight,
                        index,
                        retired.reps,
                        retired.duration_seconds,
                        weightUnit,
                      )}
                    </span>
                  </output>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="previous-card">
      <p>PREVIOUS PERFORMANCE</p>
      {!hasPrevious ? (
        <strong>NO PREVIOUS PERFORMANCE</strong>
      ) : (
        <div className="previous-list">
          {step.previous_weight_entries.map((weight, index) => (
            <output key={index}>
              <b>{entryLabel(step.protocol, index)}</b>
              <span>{previousValue(step, weight, index, weightUnit)}</span>
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
        <div className="stretch-image">
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
          <Dialog
            aria-label="DC STRETCH INFORMATION"
            className="stretch-dialog"
            onDismiss={() => setInfoOpen(false)}
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
          </Dialog>
        </div>
      )}
    </main>
  );
}

export function WorkoutComplete({
  lastOperationStatus,
  message,
  nextSlot,
  onDone,
  onUndo,
  workout,
}: {
  lastOperationStatus: "baseline" | "completed" | "skipped" | "win" | null;
  message: string;
  nextSlot: WorkoutSlot;
  onDone: () => void;
  onUndo: () => Promise<void>;
  workout: Workout;
}) {
  return (
    <div className="app-shell workout-complete">
      <style>{workoutStyles}</style>
      <strong>DC TRAINING LOG</strong>
      <div className="complete-check">✓</div>
      <h1>{workout.slot} COMPLETE</h1>
      {lastOperationStatus && (
        <p className="completion-verdict">
          {operationLabel(lastOperationStatus)}
        </p>
      )}
      <section>
        <p>NEXT WORKOUT</p>
        <b>{nextSlot}</b>
      </section>
      {message && <p className="form-message">{message}</p>}
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

function entryLabel(protocol: WorkoutStep["protocol"], index: number) {
  if (protocol === "rest_pause") return "WORK SET";
  if (protocol === "timed_hold") return "TIMED HOLD";
  return `SET ${index + 1}`;
}

function previousValue(
  step: WorkoutStep,
  weight: WeightEntry,
  index: number,
  weightUnit: WeightUnit,
) {
  return performanceValue(
    step.protocol,
    weight,
    index,
    step.previous_reps,
    step.previous_duration_seconds,
    weightUnit,
  );
}

function performanceValue(
  protocol: WorkoutStep["protocol"],
  weight: WeightEntry,
  index: number,
  reps: number[],
  durationSeconds: number | null,
  weightUnit: WeightUnit,
) {
  const load = weightDisplayLabel(weight, weightUnit);
  if (protocol === "timed_hold") return `${load} · ${durationSeconds} SECONDS`;
  if (protocol === "rest_pause") return `${load} · ${reps.join(" / ")} REPS`;
  return `${load} · ${reps[index]} REPS`;
}

function operationLabel(status: Props["lastOperationStatus"]) {
  if (status === "skipped") return "SKIPPED";
  if (status === "win") return "WIN";
  if (status === "baseline") return "FRESH BASELINE";
  return "SAVED";
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
      <Dialog aria-label={label} className="stretch-dialog" onDismiss={onClose}>
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
      </Dialog>
    </div>
  );
}

function LogbookPrompt({
  message,
  onReplace,
  onResolve,
  onUndo,
  saving,
  step,
  weightUnit,
}: {
  message: string;
  onReplace: () => void;
  onResolve: (
    action: "count_failure" | "count_win" | "use_mulligan",
  ) => Promise<boolean>;
  onUndo?: () => Promise<void>;
  saving: boolean;
  step: WorkoutStep;
  weightUnit: WeightUnit;
}) {
  const copy = logbookPromptCopy(step.enforcement_action);
  return (
    <div className="logbook-backdrop">
      <Dialog aria-label={copy.label} className="logbook-sheet">
        <p className="workout-part">LOGBOOK</p>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
        <ComparisonTable step={step} weightUnit={weightUnit} />
        {message && <p className="form-message">{message}</p>}
        <LogbookActions
          action={step.enforcement_action}
          onReplace={onReplace}
          onResolve={onResolve}
          saving={saving}
        />
        {onUndo && (
          <button
            className="secondary-action logbook-undo"
            disabled={saving}
            type="button"
            onClick={() => void onUndo()}
          >
            UNDO SAVE
          </button>
        )}
      </Dialog>
    </div>
  );
}

function logbookPromptCopy(action: WorkoutStep["enforcement_action"]) {
  if (action === "abs_choice")
    return {
      description:
        "LOAD AND PERFORMANCE MOVED IN OPPOSITE DIRECTIONS. YOU DECIDE.",
      label: "COUNT ABS RESULT",
      title: "COUNT THIS RESULT",
    };
  if (action === "first_failure")
    return {
      description:
        "THIS EXERCISE DID NOT BEAT THE LOGBOOK. USE YOUR ONE MULLIGAN OR REPLACE IT.",
      label: "LOGBOOK FAILURE",
      title: "LOGBOOK FAILURE",
    };
  return {
    description:
      "THE POST-MULLIGAN ATTEMPT DID NOT BEAT THE LOGBOOK. REPLACE THIS EXERCISE.",
    label: "REPLACEMENT REQUIRED",
    title: "REPLACEMENT REQUIRED",
  };
}

function LogbookActions({
  action,
  onReplace,
  onResolve,
  saving,
}: {
  action: WorkoutStep["enforcement_action"];
  onReplace: () => void;
  onResolve: (
    action: "count_failure" | "count_win" | "use_mulligan",
  ) => Promise<boolean>;
  saving: boolean;
}) {
  if (action === "abs_choice")
    return (
      <div className="logbook-actions">
        <button
          className="primary-action"
          disabled={saving}
          type="button"
          onClick={() => void onResolve("count_win")}
        >
          COUNT AS WIN
        </button>
        <button
          className="secondary-action"
          disabled={saving}
          type="button"
          onClick={() => void onResolve("count_failure")}
        >
          COUNT AS FAILURE
        </button>
      </div>
    );

  const firstFailure = action === "first_failure";
  return (
    <div className="logbook-actions">
      {firstFailure && (
        <button
          className="primary-action"
          disabled={saving}
          type="button"
          onClick={() => void onResolve("use_mulligan")}
        >
          USE MULLIGAN
        </button>
      )}
      <button
        className={firstFailure ? "secondary-action" : "primary-action"}
        disabled={saving}
        type="button"
        onClick={onReplace}
      >
        REPLACE EXERCISE
      </button>
    </div>
  );
}

function ComparisonTable({
  step,
  weightUnit,
}: {
  step: WorkoutStep;
  weightUnit: WeightUnit;
}) {
  return (
    <div
      className="comparison-table"
      role="table"
      aria-label="LOGBOOK COMPARISON"
    >
      <div className="comparison-heading" role="row">
        <b>SET</b>
        <b>PREVIOUS</b>
        <b>TODAY</b>
        <b>RESULT</b>
      </div>
      {step.weight_entries.map((_, index) => (
        <div role="row" key={index}>
          <b>{entryLabel(step.protocol, index)}</b>
          <span>{comparisonValue(step, true, index, weightUnit)}</span>
          <span>{comparisonValue(step, false, index, weightUnit)}</span>
          <strong>{comparisonVerdict(step, index)}</strong>
        </div>
      ))}
    </div>
  );
}

function comparisonValue(
  step: WorkoutStep,
  previous: boolean,
  index: number,
  weightUnit: WeightUnit,
) {
  const weights = previous ? step.previous_weight_entries : step.weight_entries;
  const reps = previous ? step.previous_reps : step.reps;
  const duration = previous
    ? step.previous_duration_seconds
    : step.duration_seconds;
  const weight = weights[index] ?? weights[0];
  const load = weightDisplayLabel(weight, weightUnit);
  if (step.protocol === "timed_hold") return `${load} · ${duration} SEC`;
  if (step.protocol === "rest_pause")
    return `${load} · ${reps.reduce((total, rep) => total + rep, 0)} REPS`;
  return `${load} · ${reps[index]} REPS`;
}

function weightDisplayLabel(weight: WeightEntry, unit: WeightUnit) {
  if (weight.kind && weight.kind !== "weight")
    return weight.kind.replace("_", " ").toUpperCase();
  const displayed = displayWeight(weight, unit);
  return `${displayed.converted ? "≈ " : ""}${displayed.amount} ${displayed.unit.toUpperCase()}`;
}

function comparisonVerdict(step: WorkoutStep, index: number) {
  if (step.enforcement_action === "abs_choice") return "YOU DECIDE";
  return (step.set_verdicts[index] ?? step.verdict ?? "failure").toUpperCase();
}

const workoutStyles = `
.entry-card, .entry-card input, .rep-entry label, .load-kind-label select { min-width: 0; max-width: 100%; }
.rp-total { color: var(--gray); font-size: .9rem; }
.draft-notice { color: var(--gray); font-size: .8rem; text-align: center; }

.logbook-method { margin-top: 14px; color: var(--gray); line-height: 1.5; }
.prescription { border-left: 3px solid var(--red); padding: 12px 16px; margin: -12px 0 24px; background: var(--panel); }
.prescription p { margin: 8px 0 0; }
.exercise-navigation { display: flex; gap: 10px; margin-top: 16px; }
.load-kind-label { display: grid; gap: 8px; margin-bottom: 14px; color: var(--gray); font-size: .8rem; }
.load-kind-label select { min-height: 44px; padding: 8px; color: var(--white); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }

.workout-shell { padding-top: max(18px, env(safe-area-inset-top)); }
.workout-header { min-height: 92px; display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; border-bottom: 1px solid var(--line); text-align: center; }
.workout-header > button { min-width: 44px; min-height: 44px; display: grid; place-items: center; border: 0; padding: 0; color: var(--white); background: transparent; cursor: pointer; }
.workout-header strong { font-family: Impact, sans-serif; font-size: 1.25rem; letter-spacing: .08em; }
.workout-header p { margin: 7px 0 0; font-family: Impact, sans-serif; font-size: 1.15rem; }
.workout-header span, .workout-part, .today-label { color: var(--red); }
.undo-strip { display: flex; justify-content: space-between; align-items: center; min-height: 44px; margin-top: 12px; border: 1px solid var(--red); border-radius: 6px; padding: 6px 12px; color: var(--white); font-family: Impact, sans-serif; }
.undo-strip button { min-height: 32px; border: 0; color: var(--red); background: transparent; cursor: pointer; }
.workout-main { padding: 24px 0; }
.workout-part, .today-label { margin: 0 0 10px; font-family: Impact, sans-serif; font-size: 1.25rem; letter-spacing: .08em; }
.workout-main > h1 { margin: 0 0 20px; font-size: clamp(2rem, 9vw, 3rem); text-transform: uppercase; }
.mulligan-badge { display: inline-block; margin: -12px 0 24px; border: 1px solid var(--red); border-radius: 5px; padding: 6px 9px; color: var(--red); font-family: Impact, sans-serif; letter-spacing: .08em; }
.previous-card, .entry-card, .stretch-card, .workout-complete section { border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: linear-gradient(145deg, rgba(22,22,22,.88), rgba(8,8,8,.96)); }
.previous-card p, .entry-card > p, .workout-complete section p { margin: 0 0 13px; color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .06em; }
.previous-card strong { color: var(--gray); }
.fresh-baseline-card { border-color: var(--red); }
.fresh-baseline-card > strong { display: block; margin-bottom: 14px; }
.retired-history { display: grid; gap: 16px; }
.retired-performance { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
.retired-performance-heading { display: flex; justify-content: space-between; gap: 12px; color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .05em; }
.previous-list { display: grid; gap: 10px; }
.previous-list output { display: flex; justify-content: space-between; gap: 12px; color: var(--gray); }
.previous-list b { color: var(--white); }
.today-label { margin-top: 30px; }
.entry-list { display: grid; gap: 14px; margin-top: 18px; }
.entry-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 10px; padding: 14px; }
.entry-card > p, .entry-card .rep-entry, .entry-card .conversion-preview { grid-column: 1 / -1; }
.entry-card > p { font-size: .8rem; }
.entry-card .load-kind-label { margin-bottom: 0; }
.entry-card .weight-entry { align-self: end; }
.entry-card .weight-entry input { width: 100%; }
.entry-card .weight-entry { grid-template-columns: minmax(0, 1fr) 32px; gap: 0; }
.entry-card .weight-unit { border: 0; font-size: .8rem; padding: 4px; }
.entry-card .weight-entry input, .entry-card select { min-height: 48px; }
.entry-card:has(select option[value="weight"]:not(:checked)) .load-kind-label { grid-column: 1 / -1; }

.weight-entry { display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 8px; }
.weight-entry input, .weight-unit, .rep-entry input { min-height: 58px; border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; color: var(--white); background: var(--panel); font-family: Impact, sans-serif; font-size: 1.55rem; }
.weight-unit { display: grid; place-items: center; }
.conversion-preview { display: block; margin-top: 6px; color: var(--gray); text-align: right; }
.rep-entry { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
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
.stretch-dialog-backdrop { position: fixed; inset: 0; z-index: 30; display: flex; align-items: flex-end; background: rgba(0,0,0,.72); }
.stretch-dialog { width: min(100%, 520px); max-height: 85svh; overflow: auto; margin: 0 auto; border: 1px solid var(--line); border-radius: 18px 18px 0 0; padding: 24px; background: #111; }
.dialog-close { float: right; min-width: 44px; min-height: 44px; border: 0; color: var(--gray); background: transparent; font-size: 2rem; cursor: pointer; }
.stretch-dialog h2 { clear: both; color: var(--red); }
.stretch-dialog p { color: #d4d4d1; font-size: 1.05rem; line-height: 1.4; }
.logbook-backdrop { position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end; background: rgba(0,0,0,.8); }
.logbook-sheet { width: min(100%, 560px); max-height: 92svh; overflow: auto; margin: 0 auto; border: 1px solid var(--red); border-radius: 18px 18px 0 0; padding: 24px; background: #111; }
.logbook-sheet h2 { margin: 0 0 12px; font-size: clamp(2rem, 10vw, 3.4rem); }
.logbook-sheet > p:not(.workout-part):not(.form-message) { color: #d4d4d1; line-height: 1.4; }
.comparison-table { margin: 22px 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.comparison-table > div { display: grid; grid-template-columns: .7fr 1fr 1fr .8fr; gap: 8px; padding: 11px 9px; border-bottom: 1px solid var(--line); font-size: .72rem; }
.comparison-table > div:last-child { border-bottom: 0; }
.comparison-table .comparison-heading { color: var(--gray); background: #191919; }
.comparison-table span { color: var(--gray); }
.comparison-table strong { color: var(--red); }
.logbook-actions { display: grid; gap: 10px; }
.logbook-actions .primary-action { margin-top: 0; }
.logbook-undo { width: 100%; margin-top: 10px; }
.workout-complete { min-height: 100svh; display: flex; flex-direction: column; align-items: center; padding-top: max(100px, env(safe-area-inset-top)); text-align: center; }
.workout-complete > strong { font-family: Impact, sans-serif; font-size: 1.45rem; letter-spacing: .08em; }
.complete-check { display: grid; width: 126px; height: 126px; place-items: center; margin: 72px 0 32px; border: 3px solid var(--red); border-radius: 50%; font-size: 5rem; }
.workout-complete h1 { margin: 0 0 36px; font-size: clamp(3rem, 15vw, 5rem); }
.completion-verdict { margin: -20px 0 24px; color: var(--red); font-family: Impact, sans-serif; font-size: 1.4rem; letter-spacing: .08em; }
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

function EntryFeedback({
  step,
  values,
  weights,
  weightUnit,
}: {
  step: WorkoutStep;
  values: string[];
  weights: WeightEntry[];
  weightUnit: WeightUnit;
}) {
  const shape = workoutEntryShape(step);
  return (
    <>
      {step.protocol === "rest_pause" && (
        <p className="rp-total" aria-live="polite">
          {values.some(Boolean)
            ? `${values.reduce((total, value) => total + (validPerformanceInteger(Number(value)) ? Number(value) : 0), 0)} total reps`
            : "Total appears as you enter reps"}
        </p>
      )}
      {weights.some(
        (entry) => entry.amount !== "" && !conversionPreview(entry),
      ) && (
        <p className="form-message">
          Enter a valid load in {weightUnit === "lb" ? "0.5 lb" : "0.25 kg"}{" "}
          increments.
        </p>
      )}
      {values.some(
        (value) => value !== "" && !validPerformanceInteger(Number(value)),
      ) && (
        <p className="form-message">
          Enter positive whole {shape.metric === "seconds" ? "seconds" : "reps"}{" "}
          within the supported range.
        </p>
      )}
    </>
  );
}
