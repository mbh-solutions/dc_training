import { useEffect, useState, type ReactNode } from "react";
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
  const [verifiedEditingOwner, setVerifiedEditingOwner] = useState("");
  const offline = useOfflineSync(userId, homeProps.online);
  const workout = useWorkout(
    userId,
    offline.accountState,
    offline.commitOperation,
  );
  const canEdit = editorAuthorized(
    offline.deviceAccess,
    userId,
    verifiedEditingOwner,
  );
  useEffect(() => {
    if (offline.deviceAccess === "active") setVerifiedEditingOwner(userId);
    if (offline.deviceAccess !== "readonly") return;
    setVerifiedEditingOwner("");
    setShowRotationSetup(false);
    setShowWorkout(false);
  }, [offline.deviceAccess, userId]);
  const openRotation = () => {
    if (offline.deviceAccess !== "active") return;
    setShowHistory(false);
    setShowRotationSetup(true);
  };
  const syncStatus = (
    <NetworkStatus
      deviceAccess={offline.deviceAccess}
      online={homeProps.online}
      onRetrySync={offline.retry}
      onTransferDevice={offline.transfer}
      syncState={offline.syncState}
    />
  );

  if (canEdit) {
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
  }

  if (showHistory) {
    return withSyncStatus(
      syncStatus,
      <HistoryScreen
        accountState={offline.accountState}
        commitOperation={offline.commitOperation}
        onHome={() => setShowHistory(false)}
        onOpenRotation={
          offline.deviceAccess === "active"
            ? rotationDuringBlast(workout.lifecycle, openRotation)
            : undefined
        }
        readOnly={offline.deviceAccess !== "active"}
      />,
    );
  }

  return (
    <FoundationDashboard
      homeProps={homeProps}
      offline={offline}
      onOpenHistory={() => setShowHistory(true)}
      onOpenRotation={openRotation}
      onOpenWorkout={() => setShowWorkout(true)}
      workout={workout}
    />
  );
}

function FoundationDashboard({
  homeProps,
  offline,
  onOpenHistory,
  onOpenRotation,
  onOpenWorkout,
  workout,
}: {
  homeProps: Omit<FoundationHomeProps, "userId">;
  offline: ReturnType<typeof useOfflineSync>;
  onOpenHistory: () => void;
  onOpenRotation: () => void;
  onOpenWorkout: () => void;
  workout: ReturnType<typeof useWorkout>;
}) {
  return (
    <HomeScreen
      {...homeProps}
      activeSlot={workout.activeWorkout?.slot ?? null}
      actionSaving={workout.actionSaving}
      dataReady={
        offline.deviceAccess === "active" &&
        offline.loaded &&
        offline.accountState !== null
      }
      deviceAccess={offline.deviceAccess}
      lastCompletedSlot={workout.lastCompletedSlot}
      lifecycle={workout.lifecycle}
      loadingWorkout={!offline.loaded}
      message={workout.message || offline.loadError}
      nextSlot={workout.nextSlot}
      onOpenHistory={onOpenHistory}
      onOpenRotation={
        offline.deviceAccess === "active"
          ? rotationDuringBlast(workout.lifecycle, onOpenRotation)
          : undefined
      }
      onResumeWorkout={onOpenWorkout}
      onDismissCruiseSuggestion={workout.dismissCruiseSuggestion}
      onRetrySync={offline.retry}
      onTransferDevice={offline.transfer}
      onStartCruise={workout.startCruise}
      onStartNewBlast={workout.startNewBlast}
      onStartWorkout={async () => {
        if (await workout.start()) onOpenWorkout();
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

function editorAuthorized(
  access: ReturnType<typeof useOfflineSync>["deviceAccess"],
  userId: string,
  verifiedEditingOwner: string,
) {
  return (
    access === "active" ||
    (access === "checking" && verifiedEditingOwner === userId)
  );
}

export default FoundationHome;
