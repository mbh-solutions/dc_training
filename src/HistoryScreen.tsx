import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNavigation } from "./HomeScreen.jsx";
import { correctHistoryPerformance, loadHistoryState } from "./workout-api.js";
import {
  activeWorkoutAssignmentIds,
  currentHistoryGroups,
  historyAssignmentKey,
  retiredHistoryAssignments,
  workoutEntryShape,
  type HistoryAssignment,
  type HistoryData,
  type HistoryWorkout,
  type WorkoutStep,
} from "./workout-domain.js";
import { weightMicrograms, type WeightEntry } from "./weight-conversion.js";

type Props = {
  online: boolean;
  onHome: () => void;
  onOpenRotation: () => void;
  userId: string;
};

type Performance = {
  assignment: HistoryAssignment;
  step: WorkoutStep;
  workout: HistoryWorkout;
};

type SaveCorrection = (
  step: WorkoutStep,
  weights: WeightEntry[],
  reps: number[],
  duration: number | null,
) => Promise<void>;

type CorrectionOperation = {
  fingerprint: string;
  operationId: string;
};

export default function HistoryScreen({
  online,
  onHome,
  onOpenRotation,
  userId,
}: Props) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [error, setError] = useState(online ? "" : "CONNECT TO LOAD HISTORY");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<
    string | null
  >(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<"exercises" | "workouts">("exercises");
  const correctionOperations = useRef(new Map<string, CorrectionOperation>());

  const reload = useCallback(async () => {
    const result = await loadHistoryState(userId);
    if (!result.data) {
      setError(result.error);
      return false;
    }
    setData(result.data);
    setError("");
    return true;
  }, [userId]);

  useEffect(() => {
    if (!online) {
      setError("CONNECT TO LOAD HISTORY");
      return;
    }
    let ignore = false;
    void loadHistoryState(userId).then((result) => {
      if (ignore) return;
      if (result.data) {
        setData(result.data);
        setError("");
      } else setError(result.error);
    });
    return () => {
      ignore = true;
    };
  }, [online, userId]);

  const saveCorrection = async (
    step: WorkoutStep,
    weights: WeightEntry[],
    reps: number[],
    duration: number | null,
  ) => {
    setSaving(true);
    setMessage("");
    const latest = await loadHistoryState(userId);
    if (!latest.data) {
      setSaving(false);
      setMessage(latest.error);
      return;
    }
    setData(latest.data);
    if (
      step.assignment_id !== null &&
      activeWorkoutAssignmentIds(latest.data).has(step.assignment_id)
    ) {
      setSaving(false);
      setEditingStepId(null);
      setMessage("FINISH ACTIVE WORKOUT BEFORE CORRECTING THIS EXERCISE");
      return;
    }
    const fingerprint = correctionPayloadFingerprint(weights, reps, duration);
    const pendingOperation = correctionOperations.current.get(step.step_id);
    const operationId =
      pendingOperation?.fingerprint === fingerprint
        ? pendingOperation.operationId
        : crypto.randomUUID();
    correctionOperations.current.set(step.step_id, {
      fingerprint,
      operationId,
    });
    const result = await correctHistoryPerformance(
      operationId,
      step.step_id,
      weights,
      reps,
      duration,
    );
    setSaving(false);
    if (!result.data) {
      setMessage(result.error);
      return;
    }
    correctionOperations.current.delete(step.step_id);
    if (await reload()) {
      setEditingStepId(null);
      setMessage("CORRECTION SAVED · VERDICTS RECALCULATED");
    }
  };

  return data ? (
    <LoadedHistory
      data={data}
      editingStepId={editingStepId}
      error={error}
      expanded={expanded}
      message={message}
      online={online}
      onEditStep={setEditingStepId}
      onHome={onHome}
      onOpenRotation={onOpenRotation}
      onSaveCorrection={saveCorrection}
      onSelectAssignment={setSelectedAssignmentId}
      onSelectWorkout={setSelectedWorkoutId}
      saving={saving}
      search={search}
      selectedAssignmentId={selectedAssignmentId}
      selectedWorkoutId={selectedWorkoutId}
      setExpanded={setExpanded}
      setMessage={setMessage}
      setSearch={setSearch}
      setTab={setTab}
      tab={tab}
    />
  ) : (
    <HistoryShell onHome={onHome} onOpenRotation={onOpenRotation}>
      <p className="history-state">{error || "LOADING HISTORY"}</p>
    </HistoryShell>
  );
}

function LoadedHistory({
  data,
  editingStepId,
  error,
  expanded,
  message,
  online,
  onEditStep,
  onHome,
  onOpenRotation,
  onSaveCorrection,
  onSelectAssignment,
  onSelectWorkout,
  saving,
  search,
  selectedAssignmentId,
  selectedWorkoutId,
  setExpanded,
  setMessage,
  setSearch,
  setTab,
  tab,
}: {
  data: HistoryData;
  editingStepId: string | null;
  error: string;
  expanded: string | null;
  message: string;
  online: boolean;
  onEditStep: (stepId: string | null) => void;
  onHome: () => void;
  onOpenRotation: () => void;
  onSaveCorrection: SaveCorrection;
  onSelectAssignment: (assignmentId: string | null) => void;
  onSelectWorkout: (workoutId: string | null) => void;
  saving: boolean;
  search: string;
  selectedAssignmentId: string | null;
  selectedWorkoutId: string | null;
  setExpanded: (bodyPart: string | null) => void;
  setMessage: (message: string) => void;
  setSearch: (search: string) => void;
  setTab: (tab: "exercises" | "workouts") => void;
  tab: "exercises" | "workouts";
}) {
  const selectedAssignment = data.assignments.find(
    (assignment) => assignment.assignment_id === selectedAssignmentId,
  );
  const editingStep = data.steps.find((step) => step.step_id === editingStepId);
  const activeAssignmentIds = activeWorkoutAssignmentIds(data);
  if (selectedAssignment) {
    const performances = performancesFor(data, selectedAssignment);
    return (
      <HistoryShell onHome={onHome} onOpenRotation={onOpenRotation}>
        <ExercisePerformance
          assignment={selectedAssignment}
          activeAssignmentIds={activeAssignmentIds}
          message={message}
          online={online}
          onBack={() => {
            onEditStep(null);
            setMessage("");
            onSelectAssignment(null);
          }}
          onEdit={(step) => {
            if (online) onEditStep(step.step_id);
            else setMessage("CONNECT TO CORRECT HISTORY");
          }}
          performances={performances}
        />
        {editingStep && (
          <CorrectionEditor
            message={message}
            onCancel={() => onEditStep(null)}
            onSave={onSaveCorrection}
            saving={saving}
            step={editingStep}
          />
        )}
      </HistoryShell>
    );
  }

  const selectedWorkout = data.workouts.find(
    (workout) => workout.workout_id === selectedWorkoutId,
  );
  if (selectedWorkout) {
    return (
      <HistoryShell onHome={onHome} onOpenRotation={onOpenRotation}>
        <WorkoutDetail
          activeAssignmentIds={activeAssignmentIds}
          message={message}
          online={online}
          onBack={() => {
            onEditStep(null);
            setMessage("");
            onSelectWorkout(null);
          }}
          onEdit={(step) => {
            if (online) onEditStep(step.step_id);
            else setMessage("CONNECT TO CORRECT HISTORY");
          }}
          steps={data.steps.filter(
            (step) => step.workout_id === selectedWorkout.workout_id,
          )}
          workout={selectedWorkout}
        />
        {editingStep && (
          <CorrectionEditor
            message={message}
            onCancel={() => onEditStep(null)}
            onSave={onSaveCorrection}
            saving={saving}
            step={editingStep}
          />
        )}
      </HistoryShell>
    );
  }

  return (
    <HistoryShell onHome={onHome} onOpenRotation={onOpenRotation}>
      <header className="history-header">
        <h1>HISTORY</h1>
      </header>
      <div className="history-tabs" role="tablist" aria-label="History view">
        <button
          aria-selected={tab === "exercises"}
          onClick={() => setTab("exercises")}
          role="tab"
          type="button"
        >
          EXERCISES
        </button>
        <button
          aria-selected={tab === "workouts"}
          onClick={() => setTab("workouts")}
          role="tab"
          type="button"
        >
          WORKOUTS
        </button>
      </div>
      {tab === "exercises" ? (
        <ExercisesView
          data={data}
          expanded={expanded}
          onExpand={setExpanded}
          onOpen={(assignment) => onSelectAssignment(assignment.assignment_id)}
          search={search}
          setSearch={setSearch}
        />
      ) : (
        <WorkoutsView
          data={data}
          onOpen={(workout) => onSelectWorkout(workout.workout_id)}
        />
      )}
      {error && <p className="form-message">{error}</p>}
      {message && <p className="form-message">{message}</p>}
    </HistoryShell>
  );
}

function HistoryShell({
  children,
  onHome,
  onOpenRotation,
}: {
  children: React.ReactNode;
  onHome: () => void;
  onOpenRotation: () => void;
}) {
  return (
    <div className="app-shell history-shell">
      <style>{historyStyles}</style>
      <main>{children}</main>
      <BottomNavigation
        active="history"
        onHistory={() => undefined}
        onHome={onHome}
        onRotation={onOpenRotation}
      />
    </div>
  );
}

function ExercisesView({
  data,
  expanded,
  onExpand,
  onOpen,
  search,
  setSearch,
}: {
  data: HistoryData;
  expanded: string | null;
  onExpand: (bodyPart: string | null) => void;
  onOpen: (assignment: HistoryAssignment) => void;
  search: string;
  setSearch: (search: string) => void;
}) {
  const groups = currentHistoryGroups(data.assignments);
  const retired = retiredHistoryAssignments(data.assignments);
  const matches = searchMatches(data.assignments, search);
  const changeSearch = (value: string) => {
    setSearch(value);
    const match = searchMatches(data.assignments, value)[0];
    if (match) onExpand(match.active ? match.body_part : "retired");
  };
  return (
    <section aria-label="Exercises" className="history-exercises">
      <input
        aria-label="Search exercises"
        className="history-search"
        id="history-search"
        onChange={(event) => changeSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matches[0]) onOpen(matches[0]);
        }}
        placeholder="SEARCH EXERCISES"
        type="search"
        value={search}
      />
      {search && (
        <div className="history-search-results">
          {matches.map((assignment) => (
            <ExerciseButton
              assignment={assignment}
              data={data}
              key={assignment.assignment_id}
              onOpen={onOpen}
            />
          ))}
          {matches.length === 0 && <p>NO MATCHING EXERCISE</p>}
        </div>
      )}
      <h2>CURRENT EXERCISES</h2>
      {groups.map((group) => (
        <ExerciseGroup
          assignments={group.assignments}
          bodyPart={group.bodyPart}
          data={data}
          expanded={expanded === group.bodyPart}
          key={group.bodyPart}
          onExpand={() =>
            onExpand(expanded === group.bodyPart ? null : group.bodyPart)
          }
          onOpen={onOpen}
        />
      ))}
      <ExerciseGroup
        assignments={retired}
        bodyPart="retired"
        data={data}
        expanded={expanded === "retired"}
        onExpand={() => onExpand(expanded === "retired" ? null : "retired")}
        onOpen={onOpen}
      />
      {groups.length === 0 && retired.length === 0 && (
        <p className="history-state">NO EXERCISE HISTORY YET</p>
      )}
    </section>
  );
}

function ExerciseGroup({
  assignments,
  bodyPart,
  data,
  expanded,
  onExpand,
  onOpen,
}: {
  assignments: HistoryAssignment[];
  bodyPart: string;
  data: HistoryData;
  expanded: boolean;
  onExpand: () => void;
  onOpen: (assignment: HistoryAssignment) => void;
}) {
  return (
    <section className="exercise-group">
      <button
        aria-expanded={expanded}
        className="exercise-group-toggle"
        onClick={onExpand}
        type="button"
      >
        <strong>{displayBodyPart(bodyPart)}</strong>
        <span>{assignments.length} EXERCISES</span>
        <b>{expanded ? "⌃" : "⌄"}</b>
      </button>
      {expanded && (
        <div className="exercise-group-rows">
          {assignments.map((assignment) => (
            <ExerciseButton
              assignment={assignment}
              data={data}
              key={assignment.assignment_id}
              onOpen={onOpen}
            />
          ))}
          {assignments.length === 0 && <p>NO RETIRED EXERCISES</p>}
        </div>
      )}
    </section>
  );
}

function ExerciseButton({
  assignment,
  data,
  onOpen,
}: {
  assignment: HistoryAssignment;
  data: HistoryData;
  onOpen: (assignment: HistoryAssignment) => void;
}) {
  const latest = performancesFor(data, assignment).at(-1);
  return (
    <button
      className="exercise-row"
      onClick={() => onOpen(assignment)}
      type="button"
    >
      <span>{assignment.slot}</span>
      <strong>
        {assignment.exercise}
        <small>{protocolLabel(assignment.protocol)}</small>
      </strong>
      <em>{latest ? performanceSummary(latest.step) : "NO ENTRIES"}</em>
      <b>›</b>
    </button>
  );
}

function WorkoutsView({
  data,
  onOpen,
}: {
  data: HistoryData;
  onOpen: (workout: HistoryWorkout) => void;
}) {
  const inProgress = data.workouts.filter(
    (workout) => workout.status === "in_progress",
  );
  const months = completedWorkoutMonths(data.workouts);
  return (
    <section aria-label="Workouts" className="history-workouts">
      {inProgress.map((workout) => (
        <WorkoutButton
          data={data}
          key={workout.workout_id}
          onOpen={onOpen}
          workout={workout}
        />
      ))}
      <h2>RECENT WORKOUTS</h2>
      {months.map((month) => (
        <section className="workout-month" key={month.label}>
          <h3>{month.label}</h3>
          {month.workouts.map((workout) => (
            <WorkoutButton
              data={data}
              key={workout.workout_id}
              onOpen={onOpen}
              workout={workout}
            />
          ))}
        </section>
      ))}
      {data.workouts.length === 0 && (
        <p className="history-state">NO WORKOUT HISTORY YET</p>
      )}
    </section>
  );
}

function WorkoutButton({
  data,
  onOpen,
  workout,
}: {
  data: HistoryData;
  onOpen: (workout: HistoryWorkout) => void;
  workout: HistoryWorkout;
}) {
  const steps = data.steps.filter(
    (step) => step.workout_id === workout.workout_id,
  );
  const logged = steps.filter((step) => step.status === "completed").length;
  const skipped = steps.filter((step) => step.status === "skipped").length;
  return (
    <button
      className="workout-row"
      onClick={() => onOpen(workout)}
      type="button"
    >
      <span>{shortDate(workout.started_at)}</span>
      <strong>{workout.slot}</strong>
      <em>{workout.status === "in_progress" ? "IN PROGRESS" : "COMPLETE"}</em>
      <small>
        {workout.status === "in_progress"
          ? `${logged + skipped} OF ${steps.length} STEPS`
          : `${logged} LOGGED · ${skipped} SKIPPED`}
      </small>
      <b>›</b>
    </button>
  );
}

function WorkoutDetail({
  activeAssignmentIds,
  message,
  online,
  onBack,
  onEdit,
  steps,
  workout,
}: {
  activeAssignmentIds: ReadonlySet<string>;
  message: string;
  online: boolean;
  onBack: () => void;
  onEdit: (step: WorkoutStep) => void;
  steps: WorkoutStep[];
  workout: HistoryWorkout;
}) {
  return (
    <section className="history-detail workout-history-detail">
      <BackButton label="WORKOUTS" onBack={onBack} />
      <p>{longDate(workout.started_at)}</p>
      <h1>{workout.slot} WORKOUT</h1>
      <strong className={workout.status === "in_progress" ? "red" : ""}>
        {workout.status.replace("_", " ").toUpperCase()}
      </strong>
      <div className="saved-entry-list">
        {[...steps]
          .sort((left, right) => left.ordinal - right.ordinal)
          .map((step) => (
            <button
              disabled={
                !online ||
                step.kind !== "exercise" ||
                step.status !== "completed" ||
                correctionLocked(activeAssignmentIds, step)
              }
              key={step.step_id}
              onClick={() => onEdit(step)}
              type="button"
            >
              <span>{step.ordinal}</span>
              <strong>
                {step.exercise ?? `${displayBodyPart(step.body_part)} STRETCH`}
              </strong>
              <em>
                {correctionLocked(activeAssignmentIds, step)
                  ? "FINISH ACTIVE WORKOUT TO CORRECT"
                  : stepStatus(step)}
              </em>
              <b>
                {step.status === "completed" && step.kind === "exercise"
                  ? "›"
                  : ""}
              </b>
            </button>
          ))}
      </div>
      {message && <p className="form-message">{message}</p>}
    </section>
  );
}

function ExercisePerformance({
  activeAssignmentIds,
  assignment,
  message,
  online,
  onBack,
  onEdit,
  performances,
}: {
  activeAssignmentIds: ReadonlySet<string>;
  assignment: HistoryAssignment;
  message: string;
  online: boolean;
  onBack: () => void;
  onEdit: (step: WorkoutStep) => void;
  performances: Performance[];
}) {
  const segments = performanceSegments(performances);
  return (
    <section className="history-detail exercise-performance">
      <BackButton label="EXERCISES" onBack={onBack} />
      <h1>{assignment.exercise}</h1>
      <p>
        {displayBodyPart(assignment.body_part)} ·{" "}
        {assignment.active ? "CURRENT" : "RETIRED"} ·{" "}
        {protocolConfigurationLabel(assignment)}
      </p>
      <section className="progression-card">
        <h2>PROGRESSION</h2>
        {segments.map((segment, index) => (
          <section
            className="progression-segment"
            key={`${segment.assignment.assignment_id}-${index}`}
          >
            {index > 0 && (
              <div className="reassignment-boundary">
                <strong>REASSIGNED</strong>
                <span>FRESH BASELINE</span>
              </div>
            )}
            <p>{protocolConfigurationLabel(segment.assignment)}</p>
            <ProtocolCharts
              assignment={segment.assignment}
              performances={segment.performances}
            />
          </section>
        ))}
      </section>
      <h2>RECENT PERFORMANCES</h2>
      <div className="performance-rows">
        {[...performances].reverse().map((performance) => (
          <button
            disabled={
              !online || correctionLocked(activeAssignmentIds, performance.step)
            }
            key={performance.step.step_id}
            onClick={() => onEdit(performance.step)}
            type="button"
          >
            <span>{shortDate(performance.workout.started_at)}</span>
            <strong>{performanceSummary(performance.step)}</strong>
            <em className={performance.step.verdict === "win" ? "red" : ""}>
              {correctionLocked(activeAssignmentIds, performance.step)
                ? "FINISH ACTIVE WORKOUT TO CORRECT"
                : verdictLabel(performance.step)}
            </em>
            <b>›</b>
          </button>
        ))}
      </div>
      {performances.length === 0 && (
        <p className="history-state">NO SAVED PERFORMANCES</p>
      )}
      {message && <p className="form-message">{message}</p>}
    </section>
  );
}

function ProtocolCharts({
  assignment,
  performances,
}: {
  assignment: HistoryAssignment;
  performances: Performance[];
}) {
  if (assignment.protocol === "rest_pause") {
    return (
      <>
        <LineChart label="WEIGHT" performances={performances} setIndex={0} />
        <BarChart
          label="TOTAL REPS"
          performances={performances}
          target={assignment.target_sets[0]}
          values={performances.map((item) => sum(item.step.reps))}
        />
      </>
    );
  }
  if (assignment.protocol === "timed_hold") {
    return (
      <>
        <LineChart label="WEIGHT" performances={performances} setIndex={0} />
        <BarChart
          label="HOLD (SECONDS)"
          performances={performances}
          values={performances.map((item) => item.step.duration_seconds ?? 0)}
        />
      </>
    );
  }
  const setCount = performances.reduce(
    (count, item) => Math.max(count, item.step.weight_entries.length),
    Math.max(assignment.target_sets.length, 1),
  );
  return Array.from({ length: setCount }, (_, index) => (
    <LineChart
      key={index}
      label={`SET ${index + 1}`}
      performances={performances}
      setIndex={index}
      target={assignment.target_sets[index]}
    />
  ));
}

function LineChart({
  label,
  performances,
  setIndex,
  target,
}: {
  label: string;
  performances: Performance[];
  setIndex: number;
  target?: { max: number; min: number };
}) {
  const lanePerformances = performances.filter(
    (item) => item.step.weight_entries[setIndex] !== undefined,
  );
  const values = lanePerformances.map((item) =>
    Number(item.step.weight_entries[setIndex].micrograms),
  );
  const points = chartPoints(values);
  return (
    <div className="chart-lane line-chart">
      <h3>
        {label}
        {target && ` · ${target.min}–${target.max} REPS`}
      </h3>
      <svg aria-label={`${label} progression`} role="img" viewBox="0 0 100 54">
        {target && (
          <rect className="target-band" height="11" width="86" x="8" y="22" />
        )}
        <polyline points={points.map(pointText).join(" ")} />
        {points.map((point, index) => (
          <g key={lanePerformances[index].step.step_id}>
            <circle cx={point.x} cy={point.y} r="1.8" />
            <text x={point.x} y={Math.max(point.y - 4, 5)}>
              {weightLabel(
                lanePerformances[index].step.weight_entries[setIndex],
              )}
            </text>
            {lanePerformances[index].step.reps[setIndex] && (
              <text
                className="chart-secondary"
                x={point.x}
                y={Math.max(point.y - 1, 8)}
              >
                {lanePerformances[index].step.reps[setIndex]} REPS
              </text>
            )}
          </g>
        ))}
        <ChartDates performances={lanePerformances} />
      </svg>
    </div>
  );
}

function BarChart({
  label,
  performances,
  target,
  values,
}: {
  label: string;
  performances: Performance[];
  target?: { max: number; min: number };
  values: number[];
}) {
  const max = Math.max(...values, target?.max ?? 1, 1);
  const targetTop = target ? chartY(target.max, max) : 0;
  const targetBottom = target ? chartY(target.min, max) : 0;
  return (
    <div className="chart-lane bar-chart">
      <h3>{label}</h3>
      <svg aria-label={`${label} progression`} role="img" viewBox="0 0 100 54">
        {target && (
          <rect
            className="target-band"
            height={targetBottom - targetTop}
            width="86"
            x="8"
            y={targetTop}
          />
        )}
        {values.map((value, index) => {
          const y = chartY(value, max);
          const x = chartX(index, values.length);
          return (
            <g key={performances[index].step.step_id}>
              <rect className="bar" height={45 - y} width="6" x={x - 3} y={y} />
              <text x={x} y={Math.max(y - 3, 6)}>
                {value}
              </text>
            </g>
          );
        })}
        {target && (
          <text
            className="target-label"
            x="92"
            y={(targetTop + targetBottom) / 2 + 1}
          >
            {target.min}–{target.max}
          </text>
        )}
        <ChartDates performances={performances} />
      </svg>
    </div>
  );
}

function chartY(value: number, max: number) {
  return 45 - (value / max) * 30;
}

function ChartDates({ performances }: { performances: Performance[] }) {
  return performances.map((performance, index) => (
    <text
      className="chart-date"
      key={performance.step.step_id}
      x={chartX(index, performances.length)}
      y="52"
    >
      {shortDate(performance.workout.started_at)}
    </text>
  ));
}

function CorrectionEditor({
  message,
  onCancel,
  onSave,
  saving,
  step,
}: {
  message: string;
  onCancel: () => void;
  onSave: (
    step: WorkoutStep,
    weights: WeightEntry[],
    reps: number[],
    duration: number | null,
  ) => Promise<void>;
  saving: boolean;
  step: WorkoutStep;
}) {
  const [amounts, setAmounts] = useState(
    step.weight_entries.map((weight) => weight.amount),
  );
  const [duration, setDuration] = useState(
    step.duration_seconds?.toString() ?? "",
  );
  const [localError, setLocalError] = useState("");
  const [reps, setReps] = useState(step.reps.map(String));
  const shape = workoutEntryShape(step);

  const submit = async () => {
    const weights = step.weight_entries.map((weight, index) => ({
      amount: amounts[index],
      micrograms: weightMicrograms({
        amount: amounts[index],
        unit: weight.unit,
      })?.toString(),
      unit: weight.unit,
    }));
    const repValues = reps.map(Number);
    const durationValue = shape.metric === "seconds" ? Number(duration) : null;
    if (
      weights.some((weight) => !weight.micrograms) ||
      (shape.metric === "reps" &&
        (repValues.length !== shape.valueCount ||
          repValues.some((rep) => !Number.isInteger(rep) || rep < 1))) ||
      (shape.metric === "seconds" &&
        (!Number.isInteger(durationValue) || Number(durationValue) < 1))
    ) {
      setLocalError("ENTER VALID WEIGHT AND PERFORMANCE VALUES");
      return;
    }
    await onSave(step, weights, repValues, durationValue);
  };

  return (
    <div
      aria-labelledby="correction-title"
      aria-modal="true"
      className="correction-backdrop"
      role="dialog"
    >
      <form
        className="correction-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p>HISTORICAL CORRECTION</p>
        <h2 id="correction-title">{step.exercise}</h2>
        {amounts.map((amount, index) => (
          <label key={index}>
            {amounts.length > 1 ? `SET ${index + 1} WEIGHT` : "WEIGHT"}
            <span>
              <input
                id={`correction-weight-${index}`}
                inputMode="decimal"
                onChange={(event) =>
                  setAmounts((current) =>
                    current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ),
                  )
                }
                value={amount}
              />
              {step.weight_entries[index].unit.toUpperCase()}
            </span>
          </label>
        ))}
        {shape.metric === "reps" ? (
          reps.map((rep, index) => (
            <label key={index}>
              {step.protocol === "rest_pause"
                ? `MINI-SET ${index + 1} REPS`
                : `SET ${index + 1} REPS`}
              <input
                id={`correction-reps-${index}`}
                inputMode="numeric"
                onChange={(event) =>
                  setReps((current) =>
                    current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ),
                  )
                }
                value={rep}
              />
            </label>
          ))
        ) : (
          <label>
            HOLD (SECONDS)
            <input
              id="correction-duration"
              inputMode="numeric"
              onChange={(event) => setDuration(event.target.value)}
              value={duration}
            />
          </label>
        )}
        {(localError || message) && (
          <p className="form-message">{localError || message}</p>
        )}
        <button className="primary-action" disabled={saving} type="submit">
          {saving ? "SAVING" : "SAVE CORRECTION"}
        </button>
        <button
          className="text-action"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          CANCEL
        </button>
      </form>
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button className="history-back" onClick={onBack} type="button">
      ‹ {label}
    </button>
  );
}

function performancesFor(data: HistoryData, selected: HistoryAssignment) {
  const key = historyAssignmentKey(selected);
  const assignments = data.assignments.filter(
    (assignment) => historyAssignmentKey(assignment) === key,
  );
  const assignmentIds = new Set(assignments.map((item) => item.assignment_id));
  const assignmentById = new Map(
    assignments.map((assignment) => [assignment.assignment_id, assignment]),
  );
  const workoutById = new Map(
    data.workouts.map((workout) => [workout.workout_id, workout]),
  );
  return data.steps
    .filter(
      (step) =>
        step.kind === "exercise" &&
        step.status === "completed" &&
        step.assignment_id !== null &&
        assignmentIds.has(step.assignment_id) &&
        workoutById.has(step.workout_id),
    )
    .map((step) => ({
      assignment: assignmentById.get(step.assignment_id!)!,
      step,
      workout: workoutById.get(step.workout_id)!,
    }))
    .sort(
      (left, right) =>
        Date.parse(left.workout.started_at) -
        Date.parse(right.workout.started_at),
    );
}

function correctionLocked(
  activeAssignmentIds: ReadonlySet<string>,
  step: WorkoutStep,
) {
  return (
    step.assignment_id !== null && activeAssignmentIds.has(step.assignment_id)
  );
}

function correctionPayloadFingerprint(
  weights: WeightEntry[],
  reps: number[],
  duration: number | null,
) {
  return JSON.stringify({
    duration,
    reps,
    weights: weights.map((weight) => ({
      amount: weight.amount,
      micrograms: weight.micrograms ?? null,
      unit: weight.unit,
    })),
  });
}

function performanceSegments(performances: Performance[]) {
  const segments: {
    assignment: HistoryAssignment;
    performances: Performance[];
  }[] = [];
  for (const performance of performances) {
    const segment = segments.at(-1);
    if (
      segment?.assignment.assignment_id === performance.assignment.assignment_id
    )
      segment.performances.push(performance);
    else
      segments.push({
        assignment: performance.assignment,
        performances: [performance],
      });
  }
  return segments;
}

function searchMatches(assignments: HistoryAssignment[], search: string) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [];
  const retired = retiredHistoryAssignments(assignments);
  return [...assignments.filter((assignment) => assignment.active), ...retired]
    .filter((assignment) =>
      assignment.exercise.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8);
}

function completedWorkoutMonths(workouts: HistoryWorkout[]) {
  const groups = new Map<string, HistoryWorkout[]>();
  for (const workout of workouts.filter(
    (item) => item.status === "completed",
  )) {
    const label = monthLabel(workout.started_at);
    groups.set(label, [...(groups.get(label) ?? []), workout]);
  }
  return [...groups].map(([label, monthWorkouts]) => ({
    label,
    workouts: monthWorkouts,
  }));
}

function chartPoints(values: number[]) {
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const spread = Math.max(high - low, 1);
  return values.map((value, index) => ({
    x: chartX(index, values.length),
    y: 44 - ((value - low) / spread) * 30,
  }));
}

function chartX(index: number, count: number) {
  return count < 2 ? 50 : 10 + (index / (count - 1)) * 80;
}

function pointText(point: { x: number; y: number }) {
  return `${point.x},${point.y}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function weightLabel(weight: WeightEntry | undefined) {
  return weight ? `${weight.amount} ${weight.unit.toUpperCase()}` : "";
}

function performanceSummary(step: WorkoutStep) {
  if (step.status === "skipped") return "SKIPPED";
  if (step.protocol === "timed_hold")
    return `${weightLabel(step.weight_entries[0])} × ${step.duration_seconds} SEC`;
  if (step.protocol === "rest_pause")
    return `${weightLabel(step.weight_entries[0])} × ${sum(step.reps)} · ${step.reps.join(" / ")}`;
  return step.weight_entries
    .map((weight, index) => `${weightLabel(weight)} × ${step.reps[index]}`)
    .join(" · ");
}

function stepStatus(step: WorkoutStep) {
  if (step.status !== "completed") return step.status.toUpperCase();
  return step.kind === "stretch" ? "COMPLETED" : performanceSummary(step);
}

function verdictLabel(step: WorkoutStep) {
  if (step.fresh_baseline) return "BASELINE";
  return step.verdict?.toUpperCase() ?? "PENDING";
}

function protocolLabel(protocol: HistoryAssignment["protocol"]) {
  return protocol.replace("_", "-").toUpperCase();
}

function protocolConfigurationLabel(assignment: HistoryAssignment) {
  const targets = assignment.target_sets
    .map((target) => `${target.min}–${target.max}`)
    .join(" / ");
  return `${protocolLabel(assignment.protocol)}${targets ? ` · ${targets} REPS` : ""}`;
}

function displayBodyPart(bodyPart: string) {
  const labels: Record<string, string> = {
    abs_1: "ABS 1",
    abs_2: "ABS 2",
    back_thickness: "BACK THICKNESS",
    back_width: "BACK WIDTH",
    quadriceps: "QUADS",
    retired: "RETIRED EXERCISES",
  };
  return labels[bodyPart] ?? bodyPart.replaceAll("_", " ").toUpperCase();
}

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" })
    .format(new Date(value))
    .toUpperCase();

const longDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date(value))
    .toUpperCase();

const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(value))
    .toUpperCase();

const historyStyles = `
.history-shell { padding-top: max(30px, env(safe-area-inset-top)); }
.history-header h1, .history-detail > h1 { margin: 16px 0 24px; font-size: clamp(3rem, 14vw, 4.8rem); line-height: .95; text-transform: uppercase; }
.history-tabs { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.history-tabs button { min-height: 52px; border: 0; color: var(--gray); background: transparent; font-size: 1.2rem; cursor: pointer; }
.history-tabs button[aria-selected="true"] { color: var(--white); background: linear-gradient(120deg, #d9211c, var(--red)); }
.history-exercises, .history-workouts { padding-top: 22px; }
.history-search { width: 100%; min-height: 54px; border: 1px solid var(--line); border-radius: 8px; padding: 0 18px; color: var(--white); background: #0a0a0a; font-family: Impact, sans-serif; font-size: 1rem; letter-spacing: .06em; }
.history-exercises h2, .history-workouts h2, .exercise-performance > h2, .progression-card h2 { margin: 26px 2px 12px; font-size: 1.25rem; }
.history-search-results { margin-top: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; }
.history-search-results > p, .exercise-group-rows > p { color: var(--gray); text-align: center; }
.exercise-group { margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: rgba(10,10,10,.72); }
.exercise-group-toggle { width: 100%; min-height: 62px; display: grid; grid-template-columns: 1fr auto 24px; align-items: center; gap: 10px; border: 0; padding: 0 16px; color: var(--white); background: transparent; text-align: left; cursor: pointer; }
.exercise-group-toggle strong { font-size: 1.15rem; }
.exercise-group-toggle span { color: var(--gray); font-family: Impact, sans-serif; font-size: .8rem; }
.exercise-group-toggle b { font-family: sans-serif; font-size: 1.3rem; }
.exercise-group-rows { border-top: 1px solid var(--line); padding: 0 14px; }
.exercise-row { width: 100%; min-height: 72px; display: grid; grid-template-columns: 34px 1fr auto 12px; align-items: center; gap: 10px; border: 0; border-bottom: 1px solid #292927; padding: 8px 0; color: var(--white); background: transparent; text-align: left; cursor: pointer; }
.exercise-row:last-child { border-bottom: 0; }
.exercise-row > span, .exercise-row > em { color: var(--gray); font-family: Impact, sans-serif; font-style: normal; }
.exercise-row strong { font-family: Impact, sans-serif; font-size: 1rem; }
.exercise-row small { display: block; width: fit-content; margin-top: 5px; border: 1px solid var(--red); border-radius: 3px; padding: 2px 5px; color: var(--red); font-size: .62rem; }
.exercise-row > em { max-width: 115px; font-size: .72rem; text-align: right; }
.exercise-row > b, .workout-row > b, .performance-rows button > b, .saved-entry-list button > b { color: var(--gray); font-family: sans-serif; font-size: 1.6rem; }
.workout-row { width: 100%; min-height: 82px; display: grid; grid-template-columns: 54px 45px 1fr auto 12px; align-items: center; gap: 8px; margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; color: var(--white); background: rgba(10,10,10,.72); text-align: left; cursor: pointer; }
.workout-row > span, .workout-row > small { color: var(--gray); font-family: Impact, sans-serif; }
.workout-row > strong { font-size: 1.65rem; }
.workout-row > em { color: var(--white); font-family: Impact, sans-serif; font-style: normal; }
.workout-row:first-child > em { color: var(--red); }
.workout-row > small { font-size: .72rem; text-align: right; }
.workout-month h3 { margin: 22px 3px 5px; color: var(--gray); font-family: Impact, sans-serif; font-size: 1rem; letter-spacing: .06em; }
.history-back { min-height: 44px; border: 0; padding: 8px 0; color: var(--gray); background: transparent; font-size: 1.05rem; cursor: pointer; }
.history-detail > p { margin: 0 0 8px; color: var(--gray); font-family: Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.history-detail > strong { font-family: Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.red { color: var(--red) !important; }
.saved-entry-list, .performance-rows { display: grid; gap: 8px; margin-top: 24px; }
.saved-entry-list button, .performance-rows button { min-height: 68px; display: grid; grid-template-columns: 28px 1fr auto 12px; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 13px; color: var(--white); background: #0a0a0a; text-align: left; cursor: pointer; }
.saved-entry-list button:disabled, .performance-rows button:disabled { cursor: default; opacity: .72; }
.saved-entry-list button > span, .saved-entry-list button > em, .performance-rows button > span, .performance-rows button > em { color: var(--gray); font-family: Impact, sans-serif; font-style: normal; }
.saved-entry-list button > em, .performance-rows button > em { max-width: 125px; font-size: .78rem; text-align: right; }
.progression-card { margin-top: 30px; border: 1px solid var(--line); border-radius: 10px; padding: 2px 16px 16px; background: rgba(8,8,8,.8); }
.progression-segment > p { margin: 16px 0 0; color: var(--gray); font-family: Impact, sans-serif; font-size: .78rem; letter-spacing: .06em; }
.progression-segment + .progression-segment { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); }
.reassignment-boundary { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--gray); font-family: Impact, sans-serif; font-size: .72rem; letter-spacing: .06em; }
.chart-lane { margin-top: 22px; }
.chart-lane h3 { margin: 0 0 7px; font-size: .96rem; }
.chart-lane svg { width: 100%; min-height: 185px; overflow: visible; border-bottom: 1px solid #444; }
.chart-lane polyline { fill: none; stroke: var(--white); stroke-width: 1.2; }
.chart-lane circle { fill: var(--panel); stroke: var(--white); stroke-width: 1.2; }
.chart-lane text { fill: var(--white); font-family: Impact, sans-serif; font-size: 3px; text-anchor: middle; }
.chart-lane .chart-secondary { fill: var(--gray); font-size: 2.3px; }
.chart-lane .chart-date { fill: var(--gray); font-size: 2.4px; }
.chart-lane .target-band { fill: rgba(255,255,255,.08); }
.chart-lane .target-label { fill: var(--gray); text-anchor: end; }
.chart-lane .bar { fill: var(--red); }
.history-state { margin: 80px 0; color: var(--gray); font-family: Impact, sans-serif; text-align: center; }
.correction-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; align-items: end; padding: 18px; background: rgba(0,0,0,.82); }
.correction-dialog { width: min(100%, 500px); max-height: 92svh; overflow: auto; margin: 0 auto; border: 1px solid var(--line); border-radius: 14px; padding: 24px; background: #0b0b0b; }
.correction-dialog > p:first-child { margin: 0; color: var(--red); font-family: Impact, sans-serif; }
.correction-dialog h2 { margin: 7px 0 20px; font-size: 2rem; }
.correction-dialog label { display: grid; gap: 6px; margin-top: 12px; color: var(--gray); }
.correction-dialog label > span { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; }
.correction-dialog input { width: 100%; min-height: 48px; border: 1px solid var(--line); border-radius: 6px; padding: 0 12px; color: var(--white); background: #050505; }
@media (max-width: 390px) { .workout-row { grid-template-columns: 45px 38px 1fr 12px; } .workout-row > small { grid-column: 2 / 4; text-align: left; } .exercise-row > em { display: none; } }
`;
