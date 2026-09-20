"use client";

import { useEffect, useRef, useState } from "react";
import { Tag, X } from "lucide-react";
import type { CachedProduct } from "@/types/woocommerce";
import { resolveScannedBarcode } from "@/lib/pos/resolveBarcode";
import { formatEGP, getCatalogSellingPrice } from "@/lib/pos/money";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

interface PriceCheckResult {
  barcode: string;
  name: string;
  price: number;
  stock: number | null;
  stockStatus: string;
  isScale: boolean;
}

interface PriceCheckModalProps {
  open: boolean;
  products: CachedProduct[];
  onClose: () => void;
}

/**
 * Inquiry-only price check — never adds items to the cart.
 */
export function PriceCheckModal({
  open,
  products,
  onClose,
}: PriceCheckModalProps) {
  const kb = usePosKeyboardOptional();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PriceCheckResult | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResult(null);
      setNotFound(null);
      kb?.close();
      return;
    }

    // Autofocus barcode field when opened.
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on open/close
  }, [open, onClose]);

  if (!open) return null;

  function lookup(raw: string) {
    const code = raw.trim();
    if (!code) return;

    const resolved = resolveScannedBarcode(code, products);
    setQuery("");

    if ("error" in resolved) {
      setResult(null);
      setNotFound(code.replace(/\D/g, "") || code);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return;
    }

    setNotFound(null);
    setResult({
      barcode: resolved.barcode,
      name: resolved.product.name,
      price:
        resolved.isWeighted || resolved.isScalePriced
          ? resolved.lineTotal
          : getCatalogSellingPrice(resolved.product),
      stock: resolved.product.stock_quantity,
      stockStatus: resolved.product.stock_status,
      isScale: !!(resolved.isWeighted || resolved.isScalePriced),
    });

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-check-title"
    >
      <div className="flex max-h-[min(92dvh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-sky-100 bg-sky-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <Tag className="h-7 w-7" />
            <div>
              <h2
                id="price-check-title"
                className="text-xl font-extrabold tracking-tight"
              >
                Price Check
              </h2>
              <p className="text-sm font-semibold text-sky-100">
                استعلام عن السعر · F4 · does not add to cart
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-sky-100 hover:bg-sky-500"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Scan or type barcode
            </span>
            <PosKeyboardInput
              ref={inputRef}
              inputName="price-check-barcode"
              mode="text"
              value={query}
              onChange={setQuery}
              onEnter={() => lookup(query)}
              onFocus={(e) => e.target.select()}
              autoFocus
              autoComplete="off"
              placeholder="Barcode…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3.5 text-xl font-bold tracking-wide outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25"
            />
          </label>

          {notFound && (
            <div className="rounded-2xl border-2 border-red-400 bg-red-50 px-5 py-6 text-center">
              <p className="text-2xl font-extrabold text-red-700">
                Product Not Found
              </p>
              <p className="mt-2 font-mono text-lg font-bold text-red-800">
                {notFound}
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-5 py-6 text-center">
              <p className="text-2xl font-extrabold leading-snug text-slate-900 sm:text-3xl">
                {result.name}
              </p>
              <p className="mt-4 text-4xl font-extrabold tabular-nums text-sky-800 sm:text-5xl">
                {formatEGP(result.price)}
              </p>
              {result.isScale && (
                <p className="mt-1 text-sm font-semibold text-sky-700">
                  Scale barcode total
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-base">
                <span className="rounded-xl bg-white px-4 py-2 font-extrabold text-slate-800 shadow-sm">
                  Stock:{" "}
                  {result.stock != null ? (
                    <span className="tabular-nums">{result.stock}</span>
                  ) : (
                    <span className="uppercase">{result.stockStatus}</span>
                  )}
                </span>
                <span className="font-mono text-sm text-slate-500">
                  {result.barcode}
                </span>
              </div>
            </div>
          )}

          {!result && !notFound && (
            <p className="py-8 text-center text-sm text-slate-400">
              Scan a barcode to see name, price, and stock — nothing is added to
              the sale.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-5 py-3 text-center text-xs text-slate-400">
          Press Escape to close and return to the sale
        </div>
      </div>
    </div>
  );
}
