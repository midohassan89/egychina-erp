"use client";

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Search, Star, Tag } from "lucide-react";
import { clsx } from "clsx";
import type { CachedCategory, CachedProduct } from "@/types/woocommerce";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { isScaleBarcode } from "@/lib/pos/resolveBarcode";
import {
  isCustomerLoyaltyScan,
  normalizeLoyaltyPhone,
} from "@/lib/pos/loyaltyScan";
import { formatEGP, getCatalogSellingPrice } from "@/lib/pos/money";
import { posItemKey } from "@/lib/pos/posItemKey";
import {
  buildBarcodeMap,
  lookupBarcodeMap,
} from "@/lib/pos/barcodeMap";
import { looksLikeReceiptCode } from "@/lib/pos/findReceipt";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import { SafeImage } from "@/components/ui/SafeImage";
import { usePosKeyboardOptional } from "@/components/pos/PosKeyboardContext";

export interface ProductGridHandle {
  focusSearch: () => void;
  clearSearch: () => void;
}

interface ProductGridProps {
  products: CachedProduct[];
  categories: CachedCategory[];
  isLoading: boolean;
  onAdd: (product: CachedProduct) => void;
  onBarcodeEnter: (rawInput: string) => boolean;
  /** When true, ignore scans until the not-found modal is dismissed. */
  scanLocked?: boolean;
  onOpenPriceCheck?: () => void;
}

type PosTab = "all" | "favorites";

export const ProductGrid = forwardRef<ProductGridHandle, ProductGridProps>(
  function ProductGrid(
    {
      products,
      isLoading,
      onAdd,
      onBarcodeEnter,
      scanLocked = false,
      onOpenPriceCheck,
    },
    ref,
  ) {
    const [activeTab, setActiveTab] = useState<PosTab>("all");
    /** Controlled display value — not updated during fast scanner bursts. */
    const [query, setQuery] = useState("");
    const [nameFilter, setNameFilter] = useState("");
    const queryRef = useRef(query);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const lastKeyAtRef = useRef(0);
    const scanningRef = useRef(false);
    const debounceRef = useRef<number | null>(null);
    const kb = usePosKeyboardOptional();
    queryRef.current = query;

    const barcodeMap = useMemo(() => buildBarcodeMap(products), [products]);

    useEffect(() => {
      return () => {
        if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        const input = searchInputRef.current;
        if (!input) return;
        input.focus();
        input.select();
      },
      clearSearch: () => {
        setQuery("");
        setNameFilter("");
        scanningRef.current = false;
        const input = searchInputRef.current;
        if (input) input.value = "";
      },
    }));

    function scheduleNameFilter(raw: string) {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        if (scanningRef.current) return;
        const q = raw.trim();
        if (!q || /^\d+$/.test(q) || looksLikeReceiptCode(q)) {
          setNameFilter("");
          return;
        }
        setNameFilter(q.toLowerCase());
      }, 250);
    }

    function handleQueryChange(next: string) {
      const now = performance.now();
      const gap = lastKeyAtRef.current > 0 ? now - lastKeyAtRef.current : Number.POSITIVE_INFINITY;
      lastKeyAtRef.current = now;

      // Hardware scanner: letters arrive < 35ms apart — do not refilter the grid.
      if (gap < 35 && next.length > 1) {
        scanningRef.current = true;
        queryRef.current = next;
        setQuery(next);
        if (debounceRef.current != null) {
          window.clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        return;
      }

      scanningRef.current = false;
      queryRef.current = next;
      setQuery(next);
      scheduleNameFilter(next);
    }

    function submitBarcode(raw: string) {
      if (scanLocked) return;
      const value = raw.trim();
      if (!value) return;
      let ok = false;
      try {
        ok = onBarcodeEnter(value);
      } catch (error) {
        console.error("[pos] barcode scan failed", error);
        ok = false;
      }
      setQuery("");
      setNameFilter("");
      scanningRef.current = false;
      queryRef.current = "";
      if (searchInputRef.current) searchInputRef.current.value = "";
      if (ok) {
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      } else {
        searchInputRef.current?.blur();
      }
    }

    /**
     * Enter only: receipt → loyalty → product/scale. Never while typing.
     * Prefer the live DOM value so a fast scan is not truncated by React state.
     */
    function handleSearchCommit(rawFromState?: string) {
      if (scanLocked) {
        searchInputRef.current?.blur();
        kb?.close();
        return;
      }
      const value = (
        searchInputRef.current?.value ??
        rawFromState ??
        queryRef.current
      ).trim();
      if (!value) {
        searchInputRef.current?.blur();
        kb?.close();
        return;
      }

      if (looksLikeReceiptCode(value)) {
        submitBarcode(value);
        return;
      }

      const cleanPhone = normalizeLoyaltyPhone(value);
      if (isCustomerLoyaltyScan(cleanPhone)) {
        submitBarcode(value);
        return;
      }

      const digits = value.replace(/\D/g, "");
      if (isScaleBarcode(digits)) {
        submitBarcode(digits);
        return;
      }

      const mapped = lookupBarcodeMap(barcodeMap, value);
      if (mapped) {
        submitBarcode(value);
        return;
      }
      if (digits.length >= 6) {
        submitBarcode(digits);
        return;
      }

      searchInputRef.current?.blur();
      kb?.close();
    }

    function handleSubmit(event: FormEvent) {
      event.preventDefault();
      handleSearchCommit();
    }

    return (
      <section className="flex min-h-0 flex-1 flex-col bg-slate-100">
        <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-2">
            <form onSubmit={handleSubmit} className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <PosKeyboardInput
                ref={searchInputRef}
                inputName="pos-search"
                mode="text"
                value={query}
                onChange={handleQueryChange}
                onEnter={() => handleSearchCommit()}
                onFocus={(e) => {
                  if (scanLocked) {
                    e.target.blur();
                    return;
                  }
                  e.target.select();
                }}
                disabled={scanLocked}
                placeholder="ابحث بالاسم أو امسح الباركود..."
                autoComplete="off"
                className="pos-input w-full rounded-xl border border-slate-400 bg-white py-3 pe-4 ps-11 text-base font-semibold text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </form>
            {onOpenPriceCheck && (
              <button
                type="button"
                disabled={scanLocked}
                onClick={onOpenPriceCheck}
                title="استعلام السعر (F4)"
                className="inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-sky-600 px-3 py-2 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:min-w-[7.5rem] sm:px-4"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                  <Tag className="h-4 w-4" />
                  استعلام السعر
                </span>
                <span className="text-[10px] font-semibold text-sky-100">F4</span>
              </button>
            )}
          </div>

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
              الكل
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
              المفضلة
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ProductCards
            products={products}
            nameFilter={nameFilter}
            activeTab={activeTab}
            isLoading={isLoading}
            onAdd={onAdd}
          />
        </div>
      </section>
    );
  },
);

const ProductCards = memo(function ProductCards({
  products,
  nameFilter,
  activeTab,
  isLoading,
  onAdd,
}: {
  products: CachedProduct[];
  nameFilter: string;
  activeTab: PosTab;
  isLoading: boolean;
  onAdd: (product: CachedProduct) => void;
}) {
  const visible = useMemo(() => {
    return products.filter((product) => {
      if (activeTab === "favorites" && product.isFavorite !== true) return false;
      if (!nameFilter) return true;
      const barcodes = getOpBarcodes(product).join(" ").toLowerCase();
      const hay =
        `${product.name} ${product.nameEn ?? ""} ${product.nameZh ?? ""} ${product.unit ?? ""} ${product.sku} ${barcodes}`.toLowerCase();
      return hay.includes(nameFilter);
    });
  }, [products, nameFilter, activeTab]);

  if (isLoading) {
    return (
      <p className="py-12 text-center text-slate-400">جاري تحميل المنتجات…</p>
    );
  }
  if (visible.length === 0) {
    return (
      <p className="py-12 text-center text-slate-400">
        {activeTab === "favorites"
          ? "لا توجد أصناف مفضلة بعد"
          : "لا توجد منتجات مطابقة"}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
      {visible.map((product) => {
        const price = getCatalogSellingPrice(product);
        return (
          <button
            key={posItemKey(product)}
            type="button"
            onClick={() => onAdd(product)}
            className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:border-brand-400 hover:shadow-md active:scale-[0.98]"
          >
            <div className="relative h-16 w-full shrink-0 bg-slate-100 sm:h-20">
              {product.images[0]?.src ? (
                <SafeImage
                  src={product.images[0].src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-300">
                  —
                </div>
              )}
              {product.isFavorite && (
                <span className="absolute right-1 top-1 rounded-full bg-amber-400 p-0.5 text-white shadow">
                  <Star className="h-2.5 w-2.5 fill-white" />
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2">
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-slate-900">
                {product.name}
              </p>
              <p className="mt-auto text-sm font-bold tabular-nums text-brand-700">
                {formatEGP(price)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
});
