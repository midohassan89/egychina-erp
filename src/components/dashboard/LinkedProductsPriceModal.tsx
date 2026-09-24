"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

export interface LinkedVirtualProduct {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  price: number;
  salePrice: number | null;
  bundleMultiplier: number | null;
}

interface DraftPrice {
  regularPrice: string;
  salePrice: string;
}

export async function fetchLinkedVirtualProducts(
  baseProductId: string,
): Promise<LinkedVirtualProduct[]> {
  const res = await fetch(
    `/api/products/linked-virtual?baseProductId=${encodeURIComponent(baseProductId)}`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { products?: LinkedVirtualProduct[] };
  return body.products ?? [];
}

interface LinkedProductsPriceModalProps {
  open: boolean;
  baseProductId: string;
  baseProductName?: string;
  regularPrice: number;
  salePrice: number | null;
  onClose: () => void;
  onSaved?: () => void;
}

function saleInput(salePrice: number | null | undefined): string {
  return salePrice != null && salePrice > 0 ? String(salePrice) : "";
}

export function LinkedProductsPriceModal({
  open,
  baseProductId,
  baseProductName,
  regularPrice,
  salePrice,
  onClose,
  onSaved,
}: LinkedProductsPriceModalProps) {
  const [products, setProducts] = useState<LinkedVirtualProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPrice>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !baseProductId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await fetchLinkedVirtualProducts(baseProductId);
        if (cancelled) return;
        if (rows.length === 0) {
          onCloseRef.current();
          return;
        }
        setProducts(rows);
        setDrafts(
          Object.fromEntries(
            rows.map((row) => [
              row.id,
              { regularPrice: String(row.price ?? 0), salePrice: saleInput(row.salePrice) },
            ]),
          ),
        );
      } catch {
        if (!cancelled) setError("Could not load linked products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, baseProductId]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updates = products.map((product) => {
        const draft = drafts[product.id];
        const price = Number(draft?.regularPrice);
        const saleRaw = draft?.salePrice.trim() ?? "";
        const sale = saleRaw === "" ? null : Number(saleRaw);
        return { productId: product.id, price, salePrice: sale };
      });
      const res = await fetch("/api/products/bulk-update-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const body = (await res.json()) as { error?: string; errors?: { error: string }[] };
      if (!res.ok) {
        setError(body.error ?? body.errors?.[0]?.error ?? "Could not save prices");
        return;
      }
      if (body.errors && body.errors.length > 0) {
        setError(body.errors[0]?.error ?? "Some prices were not saved");
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      setError("Could not save prices");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Skip"
        onClick={onClose}
        disabled={saving}
      />
      <div className="relative z-10 flex max-h-[min(85dvh,760px)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Update linked carton prices
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {baseProductName ? `${baseProductName} · ` : ""}
              Unit price {formatEGP(regularPrice)}
              {salePrice != null && salePrice > 0 ? ` · sale ${formatEGP(salePrice)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading linked products…
            </p>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
                const draft = drafts[product.id] ?? { regularPrice: "", salePrice: "" };
                return (
                  <li
                    key={product.id}
                    className="rounded-xl border border-slate-200 px-3 py-3"
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        {product.bundleMultiplier != null && product.bundleMultiplier > 1
                          ? `×${product.bundleMultiplier} units`
                          : "Linked pack"}
                        {product.sku ? ` · ${product.sku}` : ""}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-blue-700">
                          Regular price
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.regularPrice}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, regularPrice: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border-2 border-blue-400 bg-white px-2 py-1.5 text-sm tabular-nums text-blue-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-amber-700">
                          Sale price
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.salePrice}
                          placeholder="—"
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, salePrice: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm tabular-nums text-amber-950 outline-none placeholder:text-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/40"
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || products.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Updates
          </button>
        </div>
      </div>
    </div>
  );
}
