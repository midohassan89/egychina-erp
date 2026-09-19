"use client";

import { useMemo, useState, useRef, type FormEvent } from "react";
import { Search, Star } from "lucide-react";
import { clsx } from "clsx";
import type { CachedCategory, CachedProduct } from "@/types/woocommerce";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { formatEGP, getCatalogSellingPrice } from "@/lib/pos/money";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";

interface ProductGridProps {
  products: CachedProduct[];
  categories: CachedCategory[];
  isLoading: boolean;
  onAdd: (product: CachedProduct) => void;
  onBarcodeEnter: (rawInput: string) => boolean;
}

type PosTab = "all" | "favorites";

export function ProductGrid({
  products,
  isLoading,
  onAdd,
  onBarcodeEnter,
}: ProductGridProps) {
  const [activeTab, setActiveTab] = useState<PosTab>("all");
  const [query, setQuery] = useState("");
  const queryRef = useRef(query);
  queryRef.current = query;

  const nameFilter = useMemo(() => {
    const q = query.trim();
    if (!q || /^\d+$/.test(q)) return "";
    return q.toLowerCase();
  }, [query]);

  const visible = useMemo(() => {
    return products.filter((product) => {
      if (activeTab === "favorites" && !product.isFavorite) return false;

      if (nameFilter) {
        const barcodes = getOpBarcodes(product).join(" ").toLowerCase();
        const hay = `${product.name} ${product.sku} ${barcodes}`.toLowerCase();
        if (!hay.includes(nameFilter)) return false;
      }

      return true;
    });
  }, [products, nameFilter, activeTab]);

  function submitBarcode(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const added = onBarcodeEnter(value);
    if (added) setQuery("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitBarcode(query);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-slate-100">
      <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-3">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <PosKeyboardInput
            inputName="pos-search"
            mode="text"
            value={query}
            onChange={setQuery}
            onEnter={() => submitBarcode(queryRef.current)}
            placeholder="Search name or scan barcode…"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </form>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={clsx(
              "rounded-xl px-4 py-2.5 text-sm font-semibold",
              activeTab === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            All Items · الكل
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold",
              activeTab === "favorites"
                ? "bg-amber-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <Star
              className={clsx(
                "h-4 w-4",
                activeTab === "favorites" && "fill-white",
              )}
            />
            Favorites · المفضلة
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="py-12 text-center text-slate-400">Loading products…</p>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-slate-400">
            {activeTab === "favorites"
              ? "No favorites yet — star products in the dashboard"
              : "No products match"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((product) => {
              const price = getCatalogSellingPrice(product);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAdd(product)}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-brand-400 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="relative aspect-square bg-slate-100">
                    {product.images[0]?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0].src}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        —
                      </div>
                    )}
                    {product.isFavorite && (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-400 p-1 text-white shadow">
                        <Star className="h-3.5 w-3.5 fill-white" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p className="line-clamp-2 text-sm font-medium text-slate-900">
                      {product.name}
                    </p>
                    <p className="mt-auto text-base font-bold tabular-nums text-brand-700">
                      {formatEGP(price)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
