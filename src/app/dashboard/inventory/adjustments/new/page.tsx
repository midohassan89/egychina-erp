"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import { ADJUSTMENT_TYPES } from "@/lib/inventory/adjustmentTypes";

interface ProductOption {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

interface LineDraft {
  key: string;
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  quantityChange: string;
  unitCost: string;
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function NewInventoryAdjustmentPage() {
  const router = useRouter();
  const [type, setType] = useState<string>("WASTAGE");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 1) {
      setProductHits([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(
            `/api/products?page=1&perPage=15&q=${encodeURIComponent(q)}`,
          );
          const body = (await res.json()) as {
            products?: ProductOption[];
          };
          setProductHits(body.products ?? []);
        } catch {
          setProductHits([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [productQuery]);

  const totalImpact = useMemo(() => {
    return roundMoney(
      lines.reduce((sum, line) => {
        const qty = Number(line.quantityChange);
        const cost = Number(line.unitCost);
        if (!Number.isFinite(qty) || !Number.isFinite(cost)) return sum;
        return sum + qty * cost;
      }, 0),
    );
  }, [lines]);

  const addProduct = useCallback(async (product: ProductOption) => {
    setError(null);
    setProductQuery("");
    setProductHits([]);

    let unitCost = 0;
    try {
      const res = await fetch(
        `/api/inventory/unit-cost?productId=${encodeURIComponent(product.id)}`,
      );
      if (res.ok) {
        const body = (await res.json()) as { unitCost?: number };
        unitCost = body.unitCost ?? 0;
      }
    } catch {
      // fall through — leave unitCost editable
    }

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantityChange: String(Number(l.quantityChange || 0) - 1),
              }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          currentStock: product.stockQuantity,
          quantityChange: "-1",
          unitCost: String(unitCost),
        },
      ];
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (lines.length === 0) {
        throw new Error("Add at least one product");
      }

      const items = lines.map((line) => ({
        productId: line.productId,
        quantityChange: Number(line.quantityChange),
        unitCost: Number(line.unitCost),
      }));

      for (const item of items) {
        if (!Number.isFinite(item.quantityChange) || item.quantityChange === 0) {
          throw new Error("Each line needs a non-zero quantity change");
        }
        if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
          throw new Error("Each line needs a valid unit cost");
        }
      }

      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          notes: notes.trim() || null,
          items,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        wooError?: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? "Adjustment failed");

      router.push("/dashboard/inventory/adjustments");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/inventory/adjustments"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            تسوية جديدة · New Adjustment
          </h1>
          <p className="text-sm text-slate-500">
            Negative qty removes stock (wastage). Stock syncs to WooCommerce.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Adjustment type
            </span>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {ADJUSTMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.labelAr} / {t.labelEn}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Date
            </span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block md:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Notes
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Add products (name or barcode)
          </h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (productHits[0]) void addProduct(productHits[0]);
                }
              }}
              placeholder="Scan barcode or search by name…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            {(searching || productHits.length > 0) && productQuery.trim() && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && (
                  <li className="px-3 py-2 text-sm text-slate-400">
                    Searching…
                  </li>
                )}
                {!searching &&
                  productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void addProduct(p)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                      >
                        <span>
                          <span className="font-medium text-slate-900">
                            {p.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {p.barcode || p.sku || `WC #${p.wcId}`}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-600">
                          stock {p.stockQuantity}
                        </span>
                      </button>
                    </li>
                  ))}
                {!searching && productHits.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-400">
                    No products found
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">On hand</th>
                  <th className="py-2 pr-3 text-right">Qty change</th>
                  <th className="py-2 pr-3 text-right">Unit cost</th>
                  <th className="py-2 pr-3 text-right">Impact</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-slate-400"
                    >
                      Search and add products. Use negative qty to remove stock
                      (e.g. −5 damaged).
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const qty = Number(line.quantityChange);
                    const cost = Number(line.unitCost);
                    const impact =
                      Number.isFinite(qty) && Number.isFinite(cost)
                        ? roundMoney(qty * cost)
                        : 0;
                    return (
                      <tr key={line.key}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">
                            {line.productName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {line.barcode || "—"}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                          {line.currentStock}
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <input
                            required
                            type="number"
                            step={1}
                            value={line.quantityChange}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? {
                                        ...l,
                                        quantityChange: e.target.value,
                                      }
                                    : l,
                                ),
                              )
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <input
                            required
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, unitCost: e.target.value }
                                    : l,
                                ),
                              )
                            }
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right tabular-nums outline-none focus:border-brand-500"
                          />
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                            impact < 0
                              ? "text-red-700"
                              : impact > 0
                                ? "text-emerald-700"
                                : "text-slate-700"
                          }`}
                        >
                          {formatEGP(impact)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((l) => l.key !== line.key),
                              )
                            }
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div>
            <p className="text-sm text-slate-400">Total financial impact</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                totalImpact < 0
                  ? "text-red-300"
                  : totalImpact > 0
                    ? "text-emerald-300"
                    : "text-white"
              }`}
            >
              {formatEGP(totalImpact)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              qty change × unit cost (negative = inventory loss value)
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/inventory/adjustments"
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || lines.length === 0}
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:bg-slate-600 disabled:text-slate-300"
            >
              {isSubmitting ? "Saving & syncing…" : "Save & Sync WooCommerce"}
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
