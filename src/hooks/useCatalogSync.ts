"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingSales } from "@/lib/cache/indexeddb";
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
  refreshCatalog: () => Promise<void>;
  flushPendingSales: () => Promise<void>;
}

/**
 * POS catalog from local ERP database (`/api/products`).
 * Does not talk to WooCommerce — Managers pull WC → Prisma from the dashboard.
 */
export function useCatalogSync(): UseCatalogSyncResult {
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const flushPendingSales = useCallback(async () => {
    const result = await flushOfflineOrderQueue();
    setPendingSaleCount(result.remaining);
  }, []);

  const refreshCatalog = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/products");
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load products");
      }
      const data = (await response.json()) as {
        products: CachedProduct[];
        count: number;
      };
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingSales();
      void refreshCatalog();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    Promise.all([refreshCatalog(), getPendingSales()])
      .then(([, pending]) => {
        setPendingSaleCount(pending.length);
        if (navigator.onLine) return flushPendingSales();
      })
      .finally(() => setIsLoading(false));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCatalog, flushPendingSales]);

  return {
    products,
    productCount: products.length,
    isOnline,
    isLoading,
    isRefreshing,
    pendingSaleCount,
    error,
    refreshCatalog,
    flushPendingSales,
  };
}
