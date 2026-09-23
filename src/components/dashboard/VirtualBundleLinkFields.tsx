"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { clsx } from "clsx";

export interface BundleBaseProductOption {
  id: string;
  name: string;
  barcode: string | null;
  stockQuantity: number;
}

const QUICK_MULTIPLIERS = [3, 4, 6, 8, 12, 24] as const;

interface VirtualBundleLinkFieldsProps {
  linkedProductId: string;
  onLinkedProductIdChange: (id: string) => void;
  bundleMultiplier: string;
  onBundleMultiplierChange: (value: string) => void;
  parentLabel?: string;
  multiplierLabel?: string;
  /** Hide this product so a bundle cannot link to itself. */
  excludeProductId?: string;
}

function productLabel(product: BundleBaseProductOption): string {
  return product.barcode
    ? `${product.name} · ${product.barcode}`
    : product.name;
}

export function VirtualBundleLinkFields({
  linkedProductId,
  onLinkedProductIdChange,
  bundleMultiplier,
  onBundleMultiplierChange,
  parentLabel = "Linked base product (single unit)",
  multiplierLabel = "Bundle multiplier",
  excludeProductId,
}: VirtualBundleLinkFieldsProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<BundleBaseProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BundleBaseProductOption | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkedProductId) {
      setSelected(null);
      return;
    }
    if (selected?.id === linkedProductId) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/products/search?id=${encodeURIComponent(linkedProductId)}`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          product?: BundleBaseProductOption | null;
        };
        if (cancelled || !body.product) return;
        setSelected(body.product);
        setQuery(productLabel(body.product));
      } catch {
        // The id is still saved; the label can stay blank until the next search.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkedProductId, selected?.id]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const selectedText = selected ? productLabel(selected) : "";
    if (!q || (selected && q === selectedText)) {
      setHits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ q });
          if (excludeProductId) params.set("excludeId", excludeProductId);
          const res = await fetch(`/api/products/search?${params}`);
          const body = (await res.json()) as {
            products?: BundleBaseProductOption[];
          };
          if (cancelled) return;
          setHits(body.products ?? []);
        } catch {
          if (!cancelled) setHits([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, excludeProductId, selected]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function selectProduct(product: BundleBaseProductOption) {
    setSelected(product);
    onLinkedProductIdChange(product.id);
    setQuery(productLabel(product));
    setOpen(false);
    setHits([]);
  }

  function clearSelection() {
    setSelected(null);
    onLinkedProductIdChange("");
    setQuery("");
    setHits([]);
    setOpen(true);
  }

  const multNum = Math.floor(Number(bundleMultiplier));
  const showResults = open && query.trim().length > 0 && query !== (selected ? productLabel(selected) : "");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="block space-y-1.5 sm:col-span-2" ref={wrapRef}>
        <span className="text-sm font-medium text-slate-700">
          {parentLabel}
        </span>
        <div className="relative">
          {loading ? (
            <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          )}
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (linkedProductId) {
                setSelected(null);
                onLinkedProductIdChange("");
              }
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const first = hits[0];
                if (first) selectProduct(first);
              }
            }}
            placeholder="Type barcode or product name…"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-20 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {linkedProductId && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearSelection();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Clear
            </button>
          )}
          {showResults && (
            <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {loading && hits.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-slate-400">
                  Searching…
                </li>
              ) : hits.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-slate-400">
                  No matching products
                </li>
              ) : (
                hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectProduct(p);
                      }}
                      className={clsx(
                        "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-brand-50",
                        p.id === linkedProductId && "bg-brand-50",
                      )}
                    >
                      <span className="text-sm font-medium text-slate-900">
                        {p.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {p.barcode || "No barcode"} · stock {p.stockQuantity}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        {linkedProductId && selected && (
          <p className="text-xs text-emerald-700">
            Selected: {selected.name}
            {selected.barcode ? ` (${selected.barcode})` : ""}
          </p>
        )}
      </div>

      <div className="block space-y-1.5 sm:col-span-2">
        <span className="text-sm font-medium text-slate-700">
          {multiplierLabel}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_MULTIPLIERS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBundleMultiplierChange(String(n));
              }}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset transition",
                multNum === n
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          step={1}
          required
          value={bundleMultiplier}
          onChange={(e) => onBundleMultiplierChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          placeholder="e.g. 3"
        />
        <span className="block text-xs text-slate-500">
          Selling 1 pack deducts this many units from the base product. Use a
          quick pill or type a custom size.
        </span>
      </div>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">
        Stock / inventory fields are hidden — this virtual pack does not hold
        its own stock.
      </p>
    </div>
  );
}
