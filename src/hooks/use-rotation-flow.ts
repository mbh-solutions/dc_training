import { useState } from "react";

export type Screen = "setup" | "exercise" | "protocol" | "structure" | "review";

export function useRotationFlow(
  hasStructures: boolean,
  initialScreen: Screen = "setup",
) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  return {
    beginEdit: () => setScreen("exercise"),
    onExerciseBack: () => setScreen("setup"),
    onExerciseContinue: () => setScreen("protocol"),
    onProtocolBack: () => setScreen("exercise"),
    onProtocolContinue: () => setScreen(hasStructures ? "structure" : "review"),
    onReviewBack: () => setScreen(hasStructures ? "structure" : "protocol"),
    onStructureBack: () => setScreen("protocol"),
    onStructureContinue: () => setScreen("review"),
    saveCompleted: () => setScreen("setup"),
    screen,
  };
}
