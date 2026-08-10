import { useState } from "react";
import HistoryScreen from "./HistoryScreen.jsx";
import HomeScreen from "./HomeScreen.jsx";
import RotationSetup from "./RotationSetup.jsx";
import { WorkoutComplete, WorkoutTracer } from "./WorkoutTracer.jsx";
import { useWorkout } from "./hooks/use-workout.js";
import type { TrainingLifecycle } from "./workout-domain.js";

export type FoundationHomeProps = {
  cloudStatus: string;
  email?: string;
  online: boolean;
  onSignOut: () => Promise<void>;
  syncState: "idle" | "syncing" | "synced";
  userId: string;
};

function FoundationHome({ userId, ...homeProps }: FoundationHomeProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showRotationSetup, setShowRotationSetup] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);
  const workout = useWorkout(userId, homeProps.online);
  const openRotation = () => {
    setShowHistory(false);
    setShowRotationSetup(true);
  };

  if (workout.completedWorkout) {
    return (
      <WorkoutComplete
        lastOperationStatus={workout.lastOperationStatus}
        message={workout.message}
        nextSlot={workout.nextSlot}
        onUndo={workout.undo}
        workout={workout.completedWorkout}
        onDone={async () => {
          await workout.dismissCompleted();
          setShowWorkout(false);
        }}
      />
    );
  }

  if (workout.replacementStep && workout.activeWorkout) {
    return (
      <RotationSetup
        onBack={() => workout.beginReplacement(null)}
        replacement={{
          message: workout.message,
          onSave: workout.replaceAssignment,
          slot: workout.activeWorkout.slot,
          step: workout.replacementStep,
        }}
        userId={userId}
      />
    );
  }

  if (showWorkout && workout.activeWorkout) {
    return (
      <WorkoutTracer
        lastOperationId={workout.lastOperationId}
        lastOperationStatus={workout.lastOperationStatus}
        message={workout.message}
        actionSaving={workout.actionSaving}
        blockingStep={workout.blockingStep}
        onBeginReplacement={workout.beginReplacement}
        onExit={() => setShowWorkout(false)}
        onResolveAction={workout.resolveAction}
        onSave={workout.saveStep}
        onSkip={workout.skipStep}
        onUndo={workout.undo}
        steps={workout.steps}
        workout={workout.activeWorkout}
      />
    );
  }

  if (showRotationSetup) {
    return (
      <RotationSetup
        onBack={() => setShowRotationSetup(false)}
        userId={userId}
      />
    );
  }

  if (showHistory) {
    return (
      <HistoryScreen
        online={homeProps.online}
        onHome={() => setShowHistory(false)}
        onOpenRotation={rotationDuringBlast(workout.lifecycle, openRotation)}
        userId={userId}
      />
    );
  }

  return (
    <HomeScreen
      {...homeProps}
      activeSlot={workout.activeWorkout?.slot ?? null}
      actionSaving={workout.actionSaving}
      lastCompletedSlot={workout.lastCompletedSlot}
      lifecycle={workout.lifecycle}
      loadingWorkout={workout.loading}
      message={workout.message}
      nextSlot={workout.nextSlot}
      onOpenHistory={() => setShowHistory(true)}
      onOpenRotation={rotationDuringBlast(workout.lifecycle, openRotation)}
      onResumeWorkout={() => setShowWorkout(true)}
      onDismissCruiseSuggestion={workout.dismissCruiseSuggestion}
      onStartCruise={workout.startCruise}
      onStartNewBlast={workout.startNewBlast}
      onStartWorkout={async () => {
        if (await workout.start()) setShowWorkout(true);
      }}
    />
  );
}

function rotationDuringBlast(
  lifecycle: TrainingLifecycle | null,
  onOpenRotation: () => void,
) {
  if (lifecycle?.phase !== "blast") return undefined;
  return onOpenRotation;
}

export default FoundationHome;
