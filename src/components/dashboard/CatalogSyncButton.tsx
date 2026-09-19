"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { clsx } from "clsx";

interface CatalogSyncButtonProps {
  /** Called after a successful WooCommerce → Prisma pull. */
  onSuccess?: () => void;
  /** Visual style: page (light) or compact. */
  variant?: "page" | "compact";
}

/**
 * Manager/Accountant control to pull WooCommerce Arabic catalog into Prisma.
 */
export function CatalogSyncButton({
  onSuccess,
  variant = "page",
}: CatalogSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pullCatalog() {
    setIsSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/pull-from-wc", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        upserted?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed");
      }
      setMessage(data.message ?? `Synced ${data.upserted ?? 0} products`);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  const isPage = variant === "page";

  return (
    <div className={clsx(isPage ? "space-y-1.5" : "space-y-2")}>
      <button
        type="button"
        onClick={() => void pullCatalog()}
        disabled={isSyncing}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
          isPage ? "px-4 py-2.5" : "w-full px-3 py-2.5",
          isSyncing
            ? isPage
              ? "cursor-not-allowed bg-slate-200 text-slate-500"
              : "cursor-not-allowed bg-slate-700 text-slate-400"
            : isPage
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-brand-600 text-white hover:bg-brand-500",
        )}
      >
        <RefreshCw className={clsx("h-4 w-4", isSyncing && "animate-spin")} />
        {isSyncing ? "Pulling…" : "Pull Catalog from WooCommerce"}
      </button>
      {message && (
        <p
          className={clsx(
            "text-xs",
            isPage ? "text-brand-700" : "px-1 text-brand-300",
          )}
        >
          {message}
        </p>
      )}
      {error && (
        <p
          className={clsx(
            "text-xs",
            isPage ? "text-red-600" : "px-1 text-red-300",
          )}
        >
          {error}
        </p>
      )}
    </div>
  );
}
