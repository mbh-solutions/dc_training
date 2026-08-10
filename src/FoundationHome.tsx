import { useState } from "react";
import HomeScreen from "./HomeScreen.jsx";
import RotationSetup from "./RotationSetup.jsx";
import { WorkoutComplete, WorkoutTracer } from "./WorkoutTracer.jsx";
import { useWorkout } from "./hooks/use-workout.js";

export type FoundationHomeProps = {
  cloudStatus: string;
  email?: string;
  online: boolean;
  onSignOut: () => Promise<void>;
  syncState: "idle" | "syncing" | "synced";
  userId: string;
};

function FoundationHome({ userId, ...homeProps }: FoundationHomeProps) {
  const [showRotationSetup, setShowRotationSetup] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);
  const workout = useWorkout(userId, homeProps.online);

  if (workout.completedWorkout) {
    return (
      <WorkoutComplete
        workout={workout.completedWorkout}
        onDone={() => {
          workout.dismissCompleted();
          setShowWorkout(false);
        }}
      />
    );
  }

  if (showWorkout && workout.activeWorkout) {
    return (
      <WorkoutTracer
        lastOperationId={workout.lastOperationId}
        message={workout.message}
        onExit={() => setShowWorkout(false)}
        onSave={workout.saveStep}
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

  return (
    <HomeScreen
      {...homeProps}
      activeSlot={workout.activeWorkout?.slot ?? null}
      lastCompletedSlot={workout.lastCompletedSlot}
      loadingWorkout={workout.loading}
      message={workout.message}
      nextSlot={workout.nextSlot}
      onOpenRotation={() => setShowRotationSetup(true)}
      onResumeWorkout={() => setShowWorkout(true)}
      onStartWorkout={async () => {
        if (await workout.start()) setShowWorkout(true);
      }}
    />
  );
}

export default FoundationHome;
