import { useState } from "react";
import RotationSetupView from "./RotationSetupView.jsx";
import {
  EXERCISES,
  categoryFor,
  protocolChoices,
  structureChoices,
  type AssignmentPosition,
  type Protocol,
  type TargetSet,
  type WorkoutSlot,
} from "./rotation-config.js";
import {
  assignmentKey,
  useRotationAssignments,
  validTargetSets,
} from "./hooks/use-rotation-assignment.js";

export type Screen = "setup" | "exercise" | "protocol" | "structure" | "review";

type RotationSetupProps = { onBack: () => void; userId: string };
type DraftTarget = { max: string; min: string };

function draftTargets(targets: readonly TargetSet[]): DraftTarget[] {
  return targets.map(({ min, max }) => ({
    min: String(min),
    max: String(max),
  }));
}

function parsedTargets(targets: readonly DraftTarget[]): TargetSet[] {
  return targets.map(({ min, max }) => ({
    min: Number(min),
    max: Number(max),
  }));
}

function RotationSetup({ onBack, userId }: RotationSetupProps) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [slot, setSlot] = useState<WorkoutSlot>("A1");
  const [position, setPosition] = useState<AssignmentPosition>("chest");
  const [exercise, setExercise] = useState("");
  const [protocol, setProtocol] = useState<Protocol | "">("");
  const [structure, setStructure] = useState("");
  const [customTargets, setCustomTargets] = useState<DraftTarget[]>([
    { min: "", max: "" },
  ]);
  const [showProtocolInfo, setShowProtocolInfo] = useState(false);
  const { loadState, message, saved, saveAssignment, saving } =
    useRotationAssignments(userId);

  const assignment = saved[assignmentKey(slot, position)] ?? null;
  const availableStructures = protocol
    ? structureChoices(position, exercise, protocol)
    : [];
  const selectedStructure = availableStructures.find(
    (choice) => choice.value === structure,
  );
  const targets =
    structure === "custom"
      ? parsedTargets(customTargets)
      : [...(selectedStructure?.targets ?? [])];
  const structureValid =
    availableStructures.length === 0
      ? true
      : Boolean(selectedStructure) &&
        (structure !== "custom" || validTargetSets(targets));

  const resetDownstream = () => {
    setProtocol("");
    setStructure("");
    setCustomTargets([{ min: "", max: "" }]);
    setShowProtocolInfo(false);
  };

  const editAssignment = (
    nextSlot: WorkoutSlot,
    nextPosition: AssignmentPosition,
  ) => {
    setSlot(nextSlot);
    setPosition(nextPosition);
    const current = saved[assignmentKey(nextSlot, nextPosition)];
    if (current) {
      setExercise(current.exercise);
      setProtocol(current.protocol);
      setStructure(current.structure === "none" ? "" : current.structure);
      setCustomTargets(
        current.structure === "custom"
          ? draftTargets(current.target_sets)
          : [{ min: "", max: "" }],
      );
    } else {
      setExercise("");
      setProtocol("");
      setStructure("");
      setCustomTargets([{ min: "", max: "" }]);
    }
    setShowProtocolInfo(false);
    setScreen("exercise");
  };

  const selectExercise = (next: string) => {
    if (next !== exercise) resetDownstream();
    setExercise(next);
  };

  const selectProtocol = (next: Protocol) => {
    if (next !== protocol) {
      setStructure("");
      setCustomTargets([{ min: "", max: "" }]);
    }
    setProtocol(next);
  };

  const selectStructure = (next: string) => {
    setStructure(next);
    const preset = structureChoices(
      position,
      exercise,
      protocol as Protocol,
    ).find((choice) => choice.value === next);
    setCustomTargets(
      next === "custom"
        ? [{ min: "", max: "" }]
        : draftTargets(preset?.targets ?? []),
    );
  };

  const setCustomSetCount = (count: number) => {
    const bounded = Math.max(1, Math.min(10, count || 1));
    setCustomTargets((current) =>
      Array.from(
        { length: protocol === "rest_pause" ? 1 : bounded },
        (_, index) => current[index] ?? { min: "", max: "" },
      ),
    );
  };

  const updateCustomTarget = (
    index: number,
    field: keyof DraftTarget,
    value: string,
  ) => {
    setCustomTargets((current) =>
      current.map((target, targetIndex) =>
        targetIndex === index ? { ...target, [field]: value } : target,
      ),
    );
  };

  const save = async () => {
    if (!exercise || !protocol || !structureValid) return;
    const structureValue = availableStructures.length ? structure : "none";
    if (
      await saveAssignment(
        slot,
        position,
        exercise,
        protocol,
        structureValue,
        targets,
      )
    )
      setScreen("setup");
  };

  return (
    <RotationSetupView
      assignment={assignment}
      availableExercises={EXERCISES[categoryFor(position)]}
      availableProtocols={protocolChoices(position, exercise)}
      availableStructures={availableStructures}
      customTargets={customTargets}
      editAssignment={editAssignment}
      exercise={exercise}
      loadState={loadState}
      message={message}
      onBack={onBack}
      onExerciseBack={() => setScreen("setup")}
      onExerciseContinue={() => setScreen("protocol")}
      onProtocolBack={() => setScreen("exercise")}
      onProtocolContinue={() =>
        setScreen(availableStructures.length ? "structure" : "review")
      }
      onReviewBack={() =>
        setScreen(availableStructures.length ? "structure" : "protocol")
      }
      onStructureBack={() => setScreen("protocol")}
      onStructureContinue={() => setScreen("review")}
      position={position}
      protocol={protocol}
      save={save}
      saved={saved}
      saving={saving}
      screen={screen}
      selectExercise={selectExercise}
      selectProtocol={selectProtocol}
      selectStructure={selectStructure}
      setCustomSetCount={setCustomSetCount}
      setShowProtocolInfo={setShowProtocolInfo}
      showProtocolInfo={showProtocolInfo}
      slot={slot}
      structure={structure}
      structureValid={structureValid}
      targets={targets}
      updateCustomTarget={updateCustomTarget}
    />
  );
}

export default RotationSetup;
