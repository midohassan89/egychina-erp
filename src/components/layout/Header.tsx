"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useCatalogSync } from "@/hooks/useCatalogSync";
import { clsx } from "clsx";

export function Header() {
  const {
    isOnline,
    isRefreshing,
    productCount,
    pendingSaleCount,
    refreshCatalog,
    error,
  } = useCatalogSync();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
          Souq El Obour - POS
        </h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4 text-brand-500" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-amber-500" />
              <span className="text-amber-600">Offline</span>
            </>
          )}
          <span className="ml-4 hidden text-slate-400 sm:inline">
            Local catalog · {productCount} products
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {pendingSaleCount > 0 && (
          <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline">
            {pendingSaleCount} sale{pendingSaleCount === 1 ? "" : "s"} pending
          </span>
        )}
        {error && (
          <span className="max-w-xs truncate text-sm text-red-600">{error}</span>
        )}
        <button
          type="button"
          onClick={() => refreshCatalog()}
          disabled={isRefreshing}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            isRefreshing
              ? "cursor-not-allowed bg-slate-100 text-slate-400"
              : "bg-brand-600 text-white hover:bg-brand-700",
          )}
        >
          <RefreshCw
            className={clsx("h-4 w-4", isRefreshing && "animate-spin")}
          />
          {isRefreshing ? "Loading…" : "Refresh Catalog"}
        </button>
      </div>
    </header>
  );
}
