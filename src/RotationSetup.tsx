import RotationSetupFlow from "./RotationSetupFlow.jsx";
import { EXERCISES, categoryFor, protocolChoices } from "./rotation-config.js";
import {
  assignmentKey,
  useRotationAssignments,
} from "./hooks/use-rotation-assignment.js";
import { useRotationEditor } from "./hooks/use-rotation-editor.js";
import { useRotationFlow } from "./hooks/use-rotation-flow.js";
import { resolveAssignmentDraft } from "./rotation-assignment-draft.js";
import type { WorkoutStep } from "./workout-domain.js";
import type {
  AssignmentPosition,
  Protocol,
  TargetSet,
  WorkoutSlot,
} from "./rotation-config.js";
import { useState } from "react";

type RotationSetupProps = {
  onBack: () => void;
  replacement?: {
    onSave: (
      step: WorkoutStep,
      exercise: string,
      protocol: Protocol,
      structure: string,
      targetSets: TargetSet[],
    ) => Promise<boolean>;
    slot: WorkoutSlot;
    step: WorkoutStep;
  };
  userId: string;
};

function RotationSetup({ onBack, replacement, userId }: RotationSetupProps) {
  const [replacementSaving, setReplacementSaving] = useState(false);
  const { loadState, message, saved, saveAssignment, saving } =
    useRotationAssignments(userId);
  const editor = useRotationEditor(
    saved,
    replacement
      ? {
          position: replacement.step.body_part as AssignmentPosition,
          slot: replacement.slot,
        }
      : undefined,
  );
  const { availableStructures, structureValid, targets } =
    resolveAssignmentDraft(
      editor.position,
      editor.exercise,
      editor.protocol,
      editor.structure,
      editor.customTargets,
    );
  const flow = useRotationFlow(
    availableStructures.length > 0,
    replacement ? "exercise" : "setup",
  );
  const assignment = saved[assignmentKey(editor.slot, editor.position)] ?? null;

  const editAssignment: typeof editor.editAssignment = (slot, position) => {
    editor.editAssignment(slot, position);
    flow.beginEdit();
  };

  const save = async () => {
    if (
      !editor.exercise ||
      !editor.protocol ||
      !structureValid ||
      !(await saveCurrentAssignment())
    )
      return;
    flow.saveCompleted();
  };

  const saveCurrentAssignment = async () => {
    const structure = availableStructures.length ? editor.structure : "none";
    if (!replacement)
      return saveAssignment(
        editor.slot,
        editor.position,
        editor.exercise,
        editor.protocol as Protocol,
        structure,
        targets,
      );
    setReplacementSaving(true);
    const replaced = await replacement.onSave(
      replacement.step,
      editor.exercise,
      editor.protocol as Protocol,
      structure,
      targets,
    );
    setReplacementSaving(false);
    return replaced;
  };

  return (
    <RotationSetupFlow
      assignment={assignment}
      availableExercises={EXERCISES[categoryFor(editor.position)].filter(
        (exercise) => exercise !== replacement?.step.exercise,
      )}
      availableProtocols={protocolChoices(editor.position, editor.exercise)}
      availableStructures={availableStructures}
      customTargets={editor.customTargets}
      editAssignment={editAssignment}
      exercise={editor.exercise}
      loadState={loadState}
      message={message}
      onBack={onBack}
      onExerciseBack={replacement ? onBack : flow.onExerciseBack}
      onExerciseContinue={flow.onExerciseContinue}
      onProtocolBack={flow.onProtocolBack}
      onProtocolContinue={flow.onProtocolContinue}
      onReviewBack={flow.onReviewBack}
      onStructureBack={flow.onStructureBack}
      onStructureContinue={flow.onStructureContinue}
      position={editor.position}
      protocol={editor.protocol}
      replacement={Boolean(replacement)}
      save={save}
      saved={saved}
      saving={saving || replacementSaving}
      screen={flow.screen}
      selectExercise={editor.selectExercise}
      selectProtocol={editor.selectProtocol}
      selectStructure={editor.selectStructure}
      setCustomSetCount={editor.setCustomSetCount}
      setShowProtocolInfo={editor.setShowProtocolInfo}
      showProtocolInfo={editor.showProtocolInfo}
      slot={editor.slot}
      structure={editor.structure}
      structureValid={structureValid}
      targets={targets}
      updateCustomTarget={editor.updateCustomTarget}
    />
  );
}

export default RotationSetup;
