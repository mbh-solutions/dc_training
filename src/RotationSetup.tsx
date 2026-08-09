import RotationSetupFlow from "./RotationSetupFlow.jsx";
import {
  EXERCISES,
  categoryFor,
  protocolChoices,
} from "./rotation-config.js";
import {
  assignmentKey,
  useRotationAssignments,
} from "./hooks/use-rotation-assignment.js";
import { useRotationEditor } from "./hooks/use-rotation-editor.js";
import { useRotationFlow } from "./hooks/use-rotation-flow.js";
import { resolveAssignmentDraft } from "./rotation-assignment-draft.js";

type RotationSetupProps = { onBack: () => void; userId: string };

function RotationSetup({ onBack, userId }: RotationSetupProps) {
  const { loadState, message, saved, saveAssignment, saving } =
    useRotationAssignments(userId);
  const editor = useRotationEditor(saved);
  const { availableStructures, structureValid, targets } =
    resolveAssignmentDraft(
      editor.position,
      editor.exercise,
      editor.protocol,
      editor.structure,
      editor.customTargets,
    );
  const flow = useRotationFlow(availableStructures.length > 0);
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
      !(await saveAssignment(
        editor.slot,
        editor.position,
        editor.exercise,
        editor.protocol,
        availableStructures.length ? editor.structure : "none",
        targets,
      ))
    )
      return;
    flow.saveCompleted();
  };

  return (
    <RotationSetupFlow
      assignment={assignment}
      availableExercises={EXERCISES[categoryFor(editor.position)]}
      availableProtocols={protocolChoices(editor.position, editor.exercise)}
      availableStructures={availableStructures}
      customTargets={editor.customTargets}
      editAssignment={editAssignment}
      exercise={editor.exercise}
      loadState={loadState}
      message={message}
      onBack={onBack}
      onExerciseBack={flow.onExerciseBack}
      onExerciseContinue={flow.onExerciseContinue}
      onProtocolBack={flow.onProtocolBack}
      onProtocolContinue={flow.onProtocolContinue}
      onReviewBack={flow.onReviewBack}
      onStructureBack={flow.onStructureBack}
      onStructureContinue={flow.onStructureContinue}
      position={editor.position}
      protocol={editor.protocol}
      save={save}
      saved={saved}
      saving={saving}
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
