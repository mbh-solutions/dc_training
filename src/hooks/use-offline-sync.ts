import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  commitOfflineOperation,
  continueSyncUpgradeOnThisDevice,
  editingDeviceId,
  isCloudOwnerId,
  listenOfflineState,
  readOfflineState,
  reviewOfflineConflict,
  synchronizeOfflineState,
  useCloudOfflineConflict,
  type EditingDeviceAccess,
  type OfflineAccountState,
  type OfflineConflictReview,
  type OfflineOperationInput,
} from "../offline-sync.js";

export type OfflineSyncState =
  | "conflict"
  | "failed"
  | "synced"
  | "syncing";

export function useOfflineSync(userId: string, online: boolean) {
  const deviceId = useRef(editingDeviceId()).current;
  const cloudOwner = isCloudOwnerId(userId);
  const [accountState, setAccountState] = useState<OfflineAccountState | null>(
    null,
  );
  const [conflict, setConflict] = useState<OfflineConflictReview | null>(null);
  const [conflictDeferred, setConflictDeferred] = useState(false);
  const [deviceAccess, setDeviceAccess] = useState<EditingDeviceAccess>(() =>
    cloudOwner ? "checking" : "active",
  );
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState<OfflineSyncState>("syncing");
  const conflictBatchId = useRef<string | null>(null);
  const syncPromise = useRef<Promise<boolean> | null>(null);
  const syncRequested = useRef(false);
  const upgradePromise = useRef<Promise<boolean> | null>(null);

  useLayoutEffect(() => {
    setDeviceAccess(cloudOwner ? "checking" : "active");
  }, [cloudOwner, userId]);

  const installConflict = useCallback((next: OfflineConflictReview | null) => {
    const changed = conflictBatchId.current !== next?.batchId;
    conflictBatchId.current = next?.batchId ?? null;
    setConflict(next);
    if (next === null || changed) setConflictDeferred(false);
  }, []);

  const reload = useCallback(async () => {
    const [current, currentConflict] = await Promise.all([
      readOfflineState(userId),
      reviewOfflineConflict(userId),
    ]);
    setAccountState(current);
    installConflict(currentConflict);
    if (
      !cloudOwner ||
      (current !== null && current.accountRevision !== null)
    )
      setDeviceAccess("active");
    if (currentConflict) setSyncState("conflict");
    return current;
  }, [cloudOwner, installConflict, userId]);

  const synchronize = useCallback(() => {
    if (!online) return Promise.resolve(false);
    if (syncPromise.current) {
      syncRequested.current = true;
      return syncPromise.current;
    }
    setSyncState("syncing");
    setLoadError("");
    const work = (async () => {
      try {
        do {
          syncRequested.current = false;
          const result = await synchronizeOfflineState(userId, deviceId);
          await reload();
          if (result.status === "upgrade_required") {
            installConflict(null);
            setDeviceAccess("upgrade_required");
            setLoadError(
              "SYNC UPDATE NEEDED · OPEN THE PRIOR EDITING DEVICE WHILE CONNECTED",
            );
            setSyncState("failed");
            return false;
          }
          if (result.status === "conflict") {
            installConflict(result.conflict);
            setDeviceAccess("active");
            setLoadError(result.conflict.message);
            setSyncState("conflict");
            return false;
          }
          installConflict(null);
          setDeviceAccess("active");
        } while (syncRequested.current);
        setSyncState("synced");
        return true;
      } catch (error) {
        setSyncState("failed");
        setLoadError(error instanceof Error ? error.message : "SYNC FAILED");
        return false;
      } finally {
        syncPromise.current = null;
      }
    })();
    syncPromise.current = work;
    return work;
  }, [deviceId, installConflict, online, reload, userId]);

  useEffect(() => {
    setAccountState(null);
    conflictBatchId.current = null;
    setConflict(null);
    setConflictDeferred(false);
    setLoadError("");
    setLoaded(false);
    setSyncState("syncing");
    let active = true;
    void Promise.all([
      readOfflineState(userId),
      reviewOfflineConflict(userId),
    ])
      .then(([current, currentConflict]) => {
        if (!active) return;
        setAccountState(current);
        installConflict(currentConflict);
        if (
          !cloudOwner ||
          (current !== null && current.accountRevision !== null)
        )
          setDeviceAccess("active");
        if (currentConflict) setSyncState("conflict");
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error ? error.message : "DEVICE DATA FAILED",
        );
        setLoaded(true);
        setSyncState("failed");
      });
    const stopListening = listenOfflineState(userId, () => void reload());
    return () => {
      active = false;
      stopListening();
    };
  }, [cloudOwner, installConflict, reload, userId]);

  useEffect(() => {
    if (!online) return;
    void synchronize();
  }, [online, synchronize]);

  useEffect(() => {
    if (!online) return;
    const onForeground = () => {
      if (document.visibilityState === "visible") void synchronize();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [online, synchronize]);

  const commitOperation = useCallback(
    async (operation: OfflineOperationInput) => {
      setLoadError("");
      if (deviceAccess !== "active") {
        const message = "CONNECT TO FINISH SYNC UPDATE";
        setLoadError(message);
        return { data: null, error: message };
      }
      if (conflict) {
        const message = "REVIEW SAVED DEVICE CHANGES BEFORE EDITING";
        setLoadError(message);
        return { data: null, error: message };
      }
      try {
        const next = await commitOfflineOperation(userId, operation);
        setAccountState(next);
        if (online) void synchronize();
        return { data: next, error: "" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "CHANGE WAS NOT SAVED";
        setLoadError(message);
        return { data: null, error: message };
      }
    },
    [conflict, deviceAccess, online, synchronize, userId],
  );

  const reviewConflict = useCallback(() => {
    if (conflict) setConflictDeferred(false);
  }, [conflict]);

  const deferConflict = useCallback(() => {
    if (conflict) setConflictDeferred(true);
  }, [conflict]);

  const continueSyncUpgradeHere = useCallback(() => {
    if (!online) {
      setLoadError("CONNECT TO CONTINUE SYNC UPDATE");
      return Promise.resolve(false);
    }
    if (upgradePromise.current) return upgradePromise.current;
    const work = (async () => {
      const foregroundSync = syncPromise.current;
      if (foregroundSync) await foregroundSync;
      setLoadError("");
      setSyncState("syncing");
      try {
        const result = await continueSyncUpgradeOnThisDevice(userId, deviceId);
        await reload();
        if (result.status === "conflict") {
          installConflict(result.conflict);
          setDeviceAccess("active");
          setLoadError(result.conflict.message);
          setSyncState("conflict");
          return false;
        }
        if (result.status === "upgrade_required") {
          setDeviceAccess("upgrade_required");
          setSyncState("failed");
          return false;
        }
        installConflict(null);
        setDeviceAccess("active");
        setSyncState("synced");
        return true;
      } catch (error) {
        try {
          await reload();
        } catch {
          // Preserve the original recovery error.
        }
        setLoadError(
          error instanceof Error ? error.message : "SYNC UPDATE FAILED",
        );
        setSyncState("failed");
        return false;
      } finally {
        upgradePromise.current = null;
      }
    })();
    upgradePromise.current = work;
    return work;
  }, [deviceId, installConflict, online, reload, userId]);

  const useCloudConflict = useCallback(async () => {
    if (!online) {
      setLoadError("CONNECT TO USE CLOUD DATA");
      return false;
    }
    if (!conflict) return false;
    setLoadError("");
    setSyncState("syncing");
    try {
      const cloud = await useCloudOfflineConflict(userId, deviceId);
      setAccountState(cloud);
      installConflict(null);
      setDeviceAccess("active");
      setSyncState("synced");
      return true;
    } catch (error) {
      try {
        await reload();
      } catch {
        // Preserve the conflict-resolution error.
      }
      setLoadError(
        error instanceof Error ? error.message : "CLOUD DATA WAS NOT RESTORED",
      );
      setSyncState("failed");
      return false;
    }
  }, [conflict, deviceId, installConflict, online, reload, userId]);

  return {
    accountState,
    commitOperation,
    continueSyncUpgradeHere,
    conflict,
    conflictDeferred,
    deferConflict,
    deviceAccess,
    loadError,
    loaded,
    retry: synchronize,
    reviewConflict,
    syncState,
    useCloudConflict,
  };
}
