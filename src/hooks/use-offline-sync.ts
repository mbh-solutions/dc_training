import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitOfflineOperation,
  listenOfflineState,
  readOfflineState,
  synchronizeOfflineState,
  type OfflineAccountState,
  type OfflineOperationInput,
} from "../offline-sync.js";

export type OfflineSyncState = "failed" | "synced" | "syncing";

export function useOfflineSync(userId: string, online: boolean) {
  const [accountState, setAccountState] = useState<OfflineAccountState | null>(
    null,
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
          await synchronizeOfflineState(userId);
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
  }, [online, reload, userId]);

  useEffect(() => {
    setAccountState(null);
    setLoadError("");
    setLoaded(false);
    setSyncState("syncing");
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
  }, [reload, userId]);

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
    return () => document.removeEventListener("visibilitychange", onForeground);
  }, [online, synchronize]);

  const commitOperation = useCallback(
    async (operation: OfflineOperationInput) => {
      setLoadError("");
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
    [online, synchronize, userId],
  );

  return {
    accountState,
    commitOperation,
    loadError,
    loaded,
    retry: synchronize,
    syncState,
  };
}
