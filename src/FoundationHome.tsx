import { useEffect, useState, type ReactNode } from "react";
import HistoryScreen from "./HistoryScreen.jsx";
import HomeScreen, { NetworkStatus, SettingsScreen } from "./HomeScreen.jsx";
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
  const weightUnit = accountWeightUnit(offline.accountState);
  const workout = useWorkout(
    userId,
    offline.accountState,
    offline.commitOperation,
  );
  const canEdit =
    editorAuthorized(offline.deviceAccess, userId, verifiedEditingOwner) &&
    !offline.conflict;
  useEffect(() => {
    if (offline.deviceAccess === "active") setVerifiedEditingOwner(userId);
    if (
      offline.deviceAccess !== "upgrade_required" &&
      offline.conflict === null
    )
      return;
    setVerifiedEditingOwner("");
    setShowHistory(false);
    setShowRotationSetup(false);
    setShowWorkout(false);
  }, [offline.conflict, offline.deviceAccess, userId]);
  const openRotation = () => {
    if (!canEdit) return;
    setShowHistory(false);
    setShowRotationSetup(true);
  };
  const syncStatus = (
    <NetworkStatus
      conflictDeferred={offline.conflictDeferred}
      online={homeProps.online}
      onReviewConflict={offline.reviewConflict}
      onRetrySync={offline.retry}
      syncState={offline.syncState}
    />
  );

  if (offline.conflict && !offline.conflictDeferred)
    return (
      <SyncConflictScreen
        conflict={offline.conflict}
        online={homeProps.online}
        onDefer={offline.deferConflict}
        onUseCloud={offline.useCloudConflict}
        syncState={offline.syncState}
      />
    );

  if (offline.deviceAccess === "upgrade_required")
    return (
      <SyncUpgradeScreen
        loadError={offline.loadError}
        online={homeProps.online}
        onContinue={offline.continueSyncUpgradeHere}
        onRetry={offline.retry}
        onSignOut={homeProps.onSignOut}
        syncState={offline.syncState}
      />
    );

  const editingScreen = renderEditingScreen({
    canEdit,
    offline,
    onCloseRotation: () => setShowRotationSetup(false),
    onCloseWorkout: () => setShowWorkout(false),
    showRotationSetup,
    showWorkout,
    syncStatus,
    weightUnit,
    workout,
  });
  if (editingScreen) return editingScreen;

  if (showHistory) {
    return withSyncStatus(
      syncStatus,
      <HistoryScreen
        accountState={offline.accountState}
        commitOperation={offline.commitOperation}
        onHome={() => setShowHistory(false)}
        onOpenRotation={
          canEdit
            ? rotationDuringBlast(workout.lifecycle, openRotation)
            : undefined
        }
        preserveCorrectionDraft={canEdit}
        readOnly={!canEdit}
        weightUnit={weightUnit}
      />,
    );
  }

  return (
    <FoundationDashboard
      homeProps={homeProps}
      editingEnabled={canEdit}
      offline={offline}
      onOpenHistory={() => setShowHistory(true)}
      onOpenRotation={openRotation}
      onOpenWorkout={() => setShowWorkout(true)}
      userId={userId}
      workout={workout}
    />
  );
}

function renderEditingScreen({
  canEdit,
  offline,
  onCloseRotation,
  onCloseWorkout,
  showRotationSetup,
  showWorkout,
  syncStatus,
  weightUnit,
  workout,
}: {
  canEdit: boolean;
  offline: ReturnType<typeof useOfflineSync>;
  onCloseRotation: () => void;
  onCloseWorkout: () => void;
  showRotationSetup: boolean;
  showWorkout: boolean;
  syncStatus: ReactNode;
  weightUnit: ReturnType<typeof accountWeightUnit>;
  workout: ReturnType<typeof useWorkout>;
}) {
  if (!canEdit) return null;

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
          onCloseWorkout();
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
        onExit={onCloseWorkout}
        onResolveAction={workout.resolveAction}
        onSave={workout.saveStep}
        onSkip={workout.skipStep}
        onUndo={workout.undo}
        steps={workout.steps}
        weightUnit={weightUnit}
        workout={workout.activeWorkout}
      />,
    );
  }

  if (!showRotationSetup) return null;
  return withSyncStatus(
    syncStatus,
    <RotationSetup
      accountState={offline.accountState}
      commitOperation={offline.commitOperation}
      onBack={onCloseRotation}
    />,
  );
}

function FoundationDashboard({ ...props }: DashboardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const { homeProps, offline } = props;
  return (
    <>
      <div hidden={!showSettings}>
        {withSyncStatus(
          <NetworkStatus
            conflictDeferred={offline.conflictDeferred}
            online={homeProps.online}
            onReviewConflict={offline.reviewConflict}
            onRetrySync={offline.retry}
            syncState={offline.syncState}
          />,
          <SettingsScreen
            editingEnabled={props.editingEnabled}
            email={homeProps.email}
            online={homeProps.online}
            onBack={() => setShowSettings(false)}
            onChangeUnit={async (unit) =>
              Boolean(
                (
                  await offline.commitOperation({
                    id: crypto.randomUUID(),
                    kind: "set_weight_unit",
                    payload: { unit },
                  })
                ).data,
              )
            }
            onSignOut={homeProps.onSignOut}
            syncState={offline.syncState}
            unit={accountWeightUnit(offline.accountState)}
            userId={props.userId}
          />,
        )}
      </div>
      <div hidden={showSettings}>
        <FoundationDashboardHome
          {...props}
          onOpenSettings={() => setShowSettings(true)}
        />
      </div>
    </>
  );
}

type DashboardProps = {
  editingEnabled: boolean;
  homeProps: Omit<FoundationHomeProps, "userId">;
  offline: ReturnType<typeof useOfflineSync>;
  onOpenHistory: () => void;
  onOpenRotation: () => void;
  onOpenWorkout: () => void;
  userId: string;
  workout: ReturnType<typeof useWorkout>;
};

function FoundationDashboardHome({
  editingEnabled,
  homeProps,
  offline,
  onOpenHistory,
  onOpenRotation,
  onOpenSettings,
  onOpenWorkout,
  workout,
}: DashboardProps & {
  onOpenSettings: () => void;
}) {
  return (
    <HomeScreen
      {...homeProps}
      activeSlot={workout.activeWorkout?.slot ?? null}
      actionSaving={workout.actionSaving}
      conflictDeferred={offline.conflictDeferred}
      dataReady={
        editingEnabled && offline.loaded && offline.accountState !== null
      }
      editingEnabled={editingEnabled}
      lastCompletedSlot={workout.lastCompletedSlot}
      lifecycle={workout.lifecycle}
      loadingWorkout={!offline.loaded}
      message={workout.message || offline.loadError}
      nextSlot={workout.nextSlot}
      onOpenHistory={onOpenHistory}
      onOpenRotation={
        editingEnabled
          ? rotationDuringBlast(workout.lifecycle, onOpenRotation)
          : undefined
      }
      onOpenSettings={onOpenSettings}
      onReviewConflict={offline.reviewConflict}
      onResumeWorkout={onOpenWorkout}
      onDismissCruiseSuggestion={workout.dismissCruiseSuggestion}
      onRetrySync={offline.retry}
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

function SyncUpgradeScreen({
  loadError,
  online,
  onContinue,
  onRetry,
  onSignOut,
  syncState,
}: {
  loadError: string;
  online: boolean;
  onContinue: () => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
  syncState: ReturnType<typeof useOfflineSync>["syncState"];
}) {
  const [continueOpen, setContinueOpen] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const descriptionId = "sync-upgrade-description";
  const warningId = "sync-upgrade-continue-warning";
  const continueHere = async () => {
    if (!online || continuing) return;
    setContinuing(true);
    if (!(await onContinue())) setContinuing(false);
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>DC TRAINING</h1>
        </div>
      </header>
      <main>
        <section
          aria-atomic="true"
          aria-describedby={descriptionId}
          aria-labelledby="sync-upgrade-title"
          aria-live="polite"
          className="foundation-card"
          role="status"
        >
          <p className="section-label">ACCOUNT SYNC</p>
          <h2 id="sync-upgrade-title">SYNC UPDATE NEEDED</h2>
          <p className="foundation-copy" id={descriptionId}>
            Open DC Training on the device you last used while connected. Then
            return here and tap Try Again. Your saved data will update
            automatically.
          </p>
          <p className="foundation-copy">
            If you no longer have that device, you can continue here using the
            latest cloud data.
          </p>
          {loadError && !loadError.startsWith("SYNC UPDATE NEEDED") && (
            <p className="form-message">SYNC CHECK FAILED</p>
          )}
          <button
            aria-describedby={descriptionId}
            className="primary-action"
            disabled={!online || syncState === "syncing"}
            onClick={() => void onRetry()}
            type="button"
          >
            {syncState === "syncing" ? "CHECKING" : "TRY AGAIN"}
          </button>
          {continueOpen ? (
            <div id="sync-upgrade-continue">
              <p className="form-message" id={warningId} role="status">
                Changes that have not synced from either device cannot be
                recovered if you continue with cloud data.
              </p>
              <button
                className="secondary-action"
                disabled={continuing}
                onClick={() => setContinueOpen(false)}
                type="button"
              >
                GO BACK
              </button>
              <button
                aria-describedby={warningId}
                className="secondary-action"
                disabled={!online || continuing}
                onClick={() => void continueHere()}
                type="button"
              >
                {continuing ? "CONTINUING" : "CONTINUE ON THIS DEVICE"}
              </button>
            </div>
          ) : (
            <button
              aria-controls="sync-upgrade-continue"
              aria-expanded="false"
              className="text-action"
              onClick={() => setContinueOpen(true)}
              type="button"
            >
              CONTINUE ON THIS DEVICE
            </button>
          )}
          <button
            className="secondary-action"
            disabled={!online || syncState === "syncing"}
            onClick={() => void onSignOut()}
            type="button"
          >
            SIGN OUT
          </button>
          {!online && <p className="quiet-note">CONNECT TO CHECK SYNC</p>}
        </section>
      </main>
    </div>
  );
}

function SyncConflictScreen({
  conflict,
  online,
  onDefer,
  onUseCloud,
  syncState,
}: {
  conflict: NonNullable<ReturnType<typeof useOfflineSync>["conflict"]>;
  online: boolean;
  onDefer: () => void;
  onUseCloud: () => Promise<boolean>;
  syncState: ReturnType<typeof useOfflineSync>["syncState"];
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const descriptionId = "sync-conflict-description";
  const reviewId = "sync-conflict-device-copy";
  const stale = conflict.status === "stale";
  const resolve = async () => {
    if (!online || resolving) return;
    setResolveFailed(false);
    setResolving(true);
    if (await onUseCloud()) return;
    setResolveFailed(true);
    setResolving(false);
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PRIVATE TRAINING LOG</p>
          <h1>DC TRAINING</h1>
        </div>
      </header>
      <main>
        <section
          aria-atomic="false"
          aria-describedby={descriptionId}
          aria-labelledby="sync-conflict-title"
          aria-live="polite"
          className="foundation-card"
          role="status"
        >
          <p className="section-label">SYNC PAUSED</p>
          <h2 id="sync-conflict-title">{syncConflictTitle(stale)}</h2>
          <p className="foundation-copy" id={descriptionId}>
            {syncConflictDescription(conflict.pendingCount, stale)}
          </p>
          <p className="quiet-note" id="sync-conflict-recommended">
            RECOMMENDED · USE THE LATEST CLOUD DATA
          </p>
          <button
            aria-describedby={`${descriptionId} sync-conflict-recommended`}
            className="primary-action"
            disabled={!online || resolving || syncState === "syncing"}
            onClick={() => void resolve()}
            type="button"
          >
            {resolving ? "RESTORING" : "USE CLOUD DATA"}
          </button>
          {resolveFailed && (
            <p className="form-message" role="status">
              CLOUD DATA COULD NOT BE RESTORED · TRY AGAIN
            </p>
          )}
          <button
            aria-controls={reviewId}
            aria-expanded={detailsOpen}
            className="secondary-action"
            disabled={resolving}
            onClick={() => setDetailsOpen((open) => !open)}
            type="button"
          >
            REVIEW DEVICE COPY
          </button>
          {detailsOpen && (
            <div id={reviewId}>
              {conflict.operations.length ? (
                <ol>
                  {conflict.operations.map((operation) => (
                    <li key={operation.id}>{operation.label}</li>
                  ))}
                </ol>
              ) : (
                <p>NO DEVICE CHANGES TO DISPLAY</p>
              )}
            </div>
          )}
          <button
            className="text-action"
            disabled={resolving}
            onClick={onDefer}
            type="button"
          >
            NOT NOW
          </button>
          {!online && <p className="quiet-note">CONNECT TO USE CLOUD DATA</p>}
        </section>
      </main>
    </div>
  );
}

function syncConflictTitle(stale: boolean) {
  return stale ? "CHANGES FROM ANOTHER DEVICE" : "CHANGES NEED REVIEW";
}

function syncConflictDescription(pendingCount: number, stale: boolean) {
  const changeLabel = pendingCount === 1 ? "change" : "changes";
  const resolution = stale
    ? "combine them with newer cloud data."
    : "apply them to your cloud data.";
  return `This device has ${pendingCount} unsynced ${changeLabel}. They remain saved here. DC Training could not safely ${resolution}`;
}

function accountWeightUnit(
  accountState: ReturnType<typeof useOfflineSync>["accountState"],
) {
  return accountState?.weightUnit ?? "lb";
}

export default FoundationHome;
