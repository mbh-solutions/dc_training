import { useState, type ReactNode } from "react";
import HistoryScreen from "./HistoryScreen.jsx";
import HomeScreen, { NetworkStatus } from "./HomeScreen.jsx";
import RotationSetup from "./RotationSetup.jsx";
import { WorkoutComplete, WorkoutTracer } from "./WorkoutTracer.jsx";
import { useOfflineSync } from "./hooks/use-offline-sync.js";
import { useWorkout } from "./hooks/use-workout.js";
import type { TrainingLifecycle } from "./workout-domain.js";

export type FoundationHomeProps = {
  cloudStatus: string;
  email?: string;
  online: boolean;
  onSignOut: () => Promise<void>;
  userId: string;
};

function FoundationHome({ userId, ...homeProps }: FoundationHomeProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showRotationSetup, setShowRotationSetup] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);
  const offline = useOfflineSync(userId, homeProps.online);
  const workout = useWorkout(
    userId,
    offline.accountState,
    offline.commitOperation,
  );
  const openRotation = () => {
    setShowHistory(false);
    setShowRotationSetup(true);
  };
  const syncStatus = (
    <NetworkStatus
      online={homeProps.online}
      onRetrySync={offline.retry}
      syncState={offline.syncState}
    />
  );

  if (workout.completedWorkout) {
    return withSyncStatus(
      syncStatus,
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
      />,
    );
  }

  if (workout.replacementStep && workout.activeWorkout) {
    return withSyncStatus(
      syncStatus,
      <RotationSetup
        accountState={offline.accountState}
        commitOperation={offline.commitOperation}
        onBack={() => workout.beginReplacement(null)}
        replacement={{
          message: workout.message,
          onSave: workout.replaceAssignment,
          slot: workout.activeWorkout.slot,
          step: workout.replacementStep,
        }}
      />,
    );
  }

  if (showWorkout && workout.activeWorkout) {
    return withSyncStatus(
      syncStatus,
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
      />,
    );
  }

  if (showRotationSetup) {
    return withSyncStatus(
      syncStatus,
      <RotationSetup
        accountState={offline.accountState}
        commitOperation={offline.commitOperation}
        onBack={() => setShowRotationSetup(false)}
      />,
    );
  }

  if (showHistory) {
    return withSyncStatus(
      syncStatus,
      <HistoryScreen
        accountState={offline.accountState}
        commitOperation={offline.commitOperation}
        onHome={() => setShowHistory(false)}
        onOpenRotation={rotationDuringBlast(workout.lifecycle, openRotation)}
      />,
    );
  }

  return (
    <HomeScreen
      {...homeProps}
      activeSlot={workout.activeWorkout?.slot ?? null}
      actionSaving={workout.actionSaving}
      dataReady={offline.loaded && offline.accountState !== null}
      lastCompletedSlot={workout.lastCompletedSlot}
      lifecycle={workout.lifecycle}
      loadingWorkout={!offline.loaded}
      message={workout.message || offline.loadError}
      nextSlot={workout.nextSlot}
      onOpenHistory={() => setShowHistory(true)}
      onOpenRotation={rotationDuringBlast(workout.lifecycle, openRotation)}
      onResumeWorkout={() => setShowWorkout(true)}
      onDismissCruiseSuggestion={workout.dismissCruiseSuggestion}
      onRetrySync={offline.retry}
      onStartCruise={workout.startCruise}
      onStartNewBlast={workout.startNewBlast}
      onStartWorkout={async () => {
        if (await workout.start()) setShowWorkout(true);
      }}
      syncState={offline.syncState}
    />
  );
}

function withSyncStatus(status: ReactNode, screen: ReactNode) {
  return (
    <>
      {status}
      {screen}
    </>
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
