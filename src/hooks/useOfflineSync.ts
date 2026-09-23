"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingSales } from "@/lib/cache/indexeddb";
import { flushOfflineOrderQueue } from "@/lib/pos/orderQueue";

/** How often to push the IndexedDB queue to /api/checkout while online. */
const SYNC_EVERY_MS = 45_000;
/** How often to recount unsynced tickets for the cashier warning. */
const WATCH_EVERY_MS = 5_000;

export const PENDING_SALE_ALERT_THRESHOLD = 10;

/**
 * Background sync for the POS register.
 * Counts unsynced sales continuously and, when online, drains them one at a time.
 */
export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const pending = await getPendingSales();
    setPendingCount(pending.length);
    return pending.length;
  }, []);

  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await refreshCount();
      return;
    }

    setIsSyncing(true);
    try {
      const result = await flushOfflineOrderQueue();
      setPendingCount(result.remaining);
    } catch {
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    void refreshCount();

    const watchTimer = window.setInterval(() => {
      void refreshCount();
    }, WATCH_EVERY_MS);

    const syncTimer = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, SYNC_EVERY_MS);

    const onOnline = () => {
      void syncNow();
    };
    window.addEventListener("online", onOnline);

    const kick = window.setTimeout(() => {
      if (navigator.onLine) void syncNow();
    }, 1500);

    return () => {
      window.clearInterval(watchTimer);
      window.clearInterval(syncTimer);
      window.clearTimeout(kick);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshCount, syncNow]);

  return {
    pendingCount,
    isSyncing,
    overPendingLimit: pendingCount > PENDING_SALE_ALERT_THRESHOLD,
  };
}
