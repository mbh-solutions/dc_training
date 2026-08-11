import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitOfflineOperation,
  discardOfflineOperations,
  editingDeviceId,
  isCloudOwnerId,
  listenOfflineState,
  pendingOfflineOperationCount,
  readOfflineState,
  registerEditingDevice,
  synchronizeOfflineState,
  transferEditingDevice,
  type EditingDeviceAccess,
  type OfflineAccountState,
  type OfflineOperationInput,
} from "../offline-sync.js";

export type OfflineSyncState = "failed" | "synced" | "syncing";

export function useOfflineSync(userId: string, online: boolean) {
  const deviceId = useRef(editingDeviceId()).current;
  const deviceAuthorityRequired = isCloudOwnerId(userId);
  const [accountState, setAccountState] = useState<OfflineAccountState | null>(
    null,
  );
  const [deviceAccess, setDeviceAccess] = useState<EditingDeviceAccess>(() =>
    deviceAuthorityRequired ? cachedDeviceAccess(userId, deviceId) : "active",
  );
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState<OfflineSyncState>("syncing");
  const syncPromise = useRef<Promise<boolean> | null>(null);
  const syncRequested = useRef(false);

  const reload = useCallback(async () => {
    const current = await readOfflineState(userId);
    setAccountState(current);
    return current;
  }, [userId]);

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
          const access = deviceAuthorityRequired
            ? await registerEditingDevice(deviceId)
            : "active";
          setDeviceAccess(access);
          cacheDeviceAccess(userId, deviceId, access);
          await synchronizeOfflineState(userId, deviceId, access);
          await reload();
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
  }, [deviceAuthorityRequired, deviceId, online, reload, userId]);

  useEffect(() => {
    setAccountState(null);
    setLoadError("");
    setLoaded(false);
    setSyncState("syncing");
    setDeviceAccess(
      deviceAuthorityRequired ? cachedDeviceAccess(userId, deviceId) : "active",
    );
    let active = true;
    void readOfflineState(userId)
      .then((current) => {
        if (active) {
          setAccountState(current);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "DEVICE DATA FAILED",
          );
          setLoaded(true);
          setSyncState("failed");
        }
      });
    const stopListening = listenOfflineState(userId, () => void reload());
    return () => {
      active = false;
      stopListening();
    };
  }, [deviceAuthorityRequired, deviceId, reload, userId]);

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
        const message = "THIS DEVICE IS READ ONLY";
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
    [deviceAccess, online, synchronize, userId],
  );

  const transfer = useCallback(async () => {
    if (!online) {
      setLoadError("CONNECT TO TRANSFER EDIT ACCESS");
      return false;
    }
    setSyncState("syncing");
    try {
      if (
        deviceAccess === "readonly" &&
        (await pendingOfflineOperationCount(userId)) > 0
      )
        await discardOfflineOperations(userId);
      if (!(await synchronize())) return false;
      if ((await pendingOfflineOperationCount(userId)) > 0) {
        setLoadError("SYNC THIS DEVICE BEFORE TRANSFERRING EDIT ACCESS");
        setSyncState("failed");
        return false;
      }
      const access = await transferEditingDevice(deviceId);
      setDeviceAccess(access);
      cacheDeviceAccess(userId, deviceId, access);
      await synchronizeOfflineState(userId, deviceId, access);
      await reload();
      setLoadError("");
      setSyncState("synced");
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "TRANSFER FAILED");
      setSyncState("failed");
      return false;
    }
  }, [deviceAccess, deviceId, online, reload, synchronize, userId]);

  return {
    accountState,
    commitOperation,
    deviceAccess,
    loadError,
    loaded,
    retry: synchronize,
    syncState,
    transfer,
  };
}

function cachedDeviceAccess(userId: string, deviceId: string) {
  try {
    const cached = JSON.parse(
      localStorage.getItem(`dc-training-editing-access:${userId}`) ?? "null",
    ) as { access?: EditingDeviceAccess; deviceId?: string } | null;
    if (
      cached?.deviceId === deviceId &&
      (cached.access === "active" || cached.access === "readonly")
    )
      return cached.access;
  } catch {
    // Online verification will replace an unavailable or corrupt cache.
  }
  return "checking";
}

function cacheDeviceAccess(
  userId: string,
  deviceId: string,
  access: EditingDeviceAccess,
) {
  try {
    localStorage.setItem(
      `dc-training-editing-access:${userId}`,
      JSON.stringify({ access, deviceId }),
    );
  } catch {
    // Access still applies for this mounted session.
  }
}
