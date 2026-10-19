"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedProducts,
  getPendingSales,
  getSyncMetadata,
  mergeCatalogDelta,
  saveCatalogToCache,
} from "@/lib/cache/indexeddb";
import { flushOfflineOrderQueue } from "@/lib/pos/orderQueue";
import type { CachedProduct } from "@/types/woocommerce";

interface UseCatalogSyncResult {
  products: CachedProduct[];
  productCount: number;
  isOnline: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  pendingSaleCount: number;
  error: string | null;
  /** Reload catalog from local Prisma via /api/products (not WooCommerce). */
  refreshCatalog: (mode?: "auto" | "full") => Promise<void>;
  flushPendingSales: () => Promise<void>;
}

interface CatalogResponse {
  products?: CachedProduct[];
  removedPrismaIds?: string[];
  delta?: boolean;
  serverTime?: string;
  error?: string;
}

const DELTA_MS = 60_000;

/**
 * POS catalog from local ERP database (`/api/products`).
 * The full list is stored in IndexedDB once. Later syncs request only
 * rows changed after `lastSyncedAt` (`?updatedSince=`).
 */
export function useCatalogSync(): UseCatalogSyncResult {
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const syncing = useRef(false);

  const flushPendingSales = useCallback(async () => {
    const result = await flushOfflineOrderQueue();
    setPendingSaleCount(result.remaining);
  }, []);

  const refreshCatalog = useCallback(async (mode: "auto" | "full" = "auto") => {
    if (syncing.current) return;
    syncing.current = true;
    setIsRefreshing(true);
    setError(null);
    try {
      const meta = await getSyncMetadata();
      const cachedCount = (await getCachedProducts()).length;
      const since =
        mode === "full" || !meta.lastSyncedAt || cachedCount === 0
          ? null
          : meta.lastSyncedAt;
      const url = since
        ? `/api/products?updatedSince=${encodeURIComponent(since)}`
        : "/api/products";
      const response = await fetch(url);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as CatalogResponse;
        throw new Error(body.error ?? "Failed to load products");
      }
      const data = (await response.json()) as CatalogResponse;
      const syncedAt = data.serverTime ?? new Date().toISOString();
      if (since) {
        await mergeCatalogDelta({
          upserts: data.products ?? [],
          removedPrismaIds: data.removedPrismaIds ?? [],
          syncedAt,
        });
      } else {
        await saveCatalogToCache(data.products ?? [], [], [], syncedAt);
      }
      setProducts(await getCachedProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      syncing.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingSales();
      void refreshCatalog("auto");
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void (async () => {
      try {
        const cached = await getCachedProducts();
        if (cached.length > 0) setProducts(cached);
        const pending = await getPendingSales();
        setPendingSaleCount(pending.length);
        if (navigator.onLine) {
          await refreshCatalog(cached.length > 0 ? "auto" : "full");
          await flushPendingSales();
        }
      } finally {
        setIsLoading(false);
      }
    })();

    const timer = window.setInterval(() => {
      if (navigator.onLine) void refreshCatalog("auto");
    }, DELTA_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCatalog, flushPendingSales]);

  return {
    products,
    productCount: products.filter((product) => !product.isPackage).length,
    isOnline,
    isLoading,
    isRefreshing,
    pendingSaleCount,
    error,
    refreshCatalog,
    flushPendingSales,
  };
}
