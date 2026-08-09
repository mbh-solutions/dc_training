import { useState } from "react";
import RotationSetupView from "./RotationSetupView.jsx";
import {
  CHEST_EXERCISES,
  useRotationAssignment,
  type Protocol,
} from "./hooks/use-rotation-assignment.js";

type ChestExercise = (typeof CHEST_EXERCISES)[number];
export type RangeChoice = "11-15" | "15-20" | "custom";
export type Screen = "setup" | "exercise" | "protocol" | "range" | "review";
const POSTGRES_INTEGER_MAX = 2_147_483_647;

type RotationSetupProps = {
  onBack: () => void;
  userId: string;
};

function targetRange(
  rangeChoice: RangeChoice | "",
  customMin: string,
  customMax: string,
) {
  if (rangeChoice === "11-15") return [11, 15];
  if (rangeChoice === "15-20") return [15, 20];
  return [Number(customMin), Number(customMax)];
}

function validRange(rangeChoice: RangeChoice | "", target: number[]) {
  if (rangeChoice === "11-15" || rangeChoice === "15-20") return true;
  return (
    rangeChoice === "custom" &&
    Number.isInteger(target[0]) &&
    Number.isInteger(target[1]) &&
    target[0] > 0 &&
    target[0] <= POSTGRES_INTEGER_MAX &&
    target[1] <= POSTGRES_INTEGER_MAX &&
    target[1] >= target[0]
  );
}

function RotationSetup({ onBack, userId }: RotationSetupProps) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [exercise, setExercise] = useState<ChestExercise | "">("");
  const [protocol, setProtocol] = useState<Protocol | "">("");
  const [rangeChoice, setRangeChoice] = useState<RangeChoice | "">("");
  const [customMin, setCustomMin] = useState("");
  const [customMax, setCustomMax] = useState("");
  const [showProtocolInfo, setShowProtocolInfo] = useState(false);
  const { loadState, message, saved, saveAssignment, saving } =
    useRotationAssignment(userId);

  const target = targetRange(rangeChoice, customMin, customMax);
  const rangeValid = validRange(rangeChoice, target);

  const selectProtocol = (next: Protocol) => {
    if (next !== protocol) {
      setRangeChoice("");
      setCustomMin("");
      setCustomMax("");
    }
    setProtocol(next);
  };

  const selectExercise = (next: ChestExercise) => {
    if (next !== exercise) {
      setProtocol("");
      setRangeChoice("");
      setCustomMin("");
      setCustomMax("");
    }
    setExercise(next);
  };

  const editAssignment = () => {
    if (saved) {
      setExercise(saved.exercise);
      setProtocol(saved.protocol);
      if (saved.protocol === "rest_pause") {
        const preset = `${saved.target_min}-${saved.target_max}`;
        if (preset === "11-15" || preset === "15-20") {
          setRangeChoice(preset);
        } else {
          setRangeChoice("custom");
          setCustomMin(String(saved.target_min));
          setCustomMax(String(saved.target_max));
        }
      }
    }
    setScreen("exercise");
  };

  const save = async () => {
    if (!exercise || !protocol || (protocol === "rest_pause" && !rangeValid))
      return;
    if (await saveAssignment(exercise, protocol, target)) setScreen("setup");
  };

  return (
    <RotationSetupView
      customMax={customMax}
      customMin={customMin}
      editAssignment={editAssignment}
      exercise={exercise}
      loadState={loadState}
      message={message}
      onBack={onBack}
      onExerciseBack={() => setScreen("setup")}
      onExerciseContinue={() => setScreen("protocol")}
      onProtocolBack={() => setScreen("exercise")}
      onProtocolContinue={() =>
        setScreen(protocol === "rest_pause" ? "range" : "review")
      }
      onRangeBack={() => setScreen("protocol")}
      onRangeContinue={() => setScreen("review")}
      onReviewBack={() =>
        setScreen(protocol === "rest_pause" ? "range" : "protocol")
      }
      protocol={protocol}
      rangeChoice={rangeChoice}
      rangeValid={rangeValid}
      saved={saved}
      save={save}
      saving={saving}
      screen={screen}
      selectExercise={selectExercise}
      selectProtocol={selectProtocol}
      setCustomMax={setCustomMax}
      setCustomMin={setCustomMin}
      setRangeChoice={setRangeChoice}
      setShowProtocolInfo={setShowProtocolInfo}
      showProtocolInfo={showProtocolInfo}
      target={target}
    />
  );
}

export default RotationSetup;
