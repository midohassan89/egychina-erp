"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { clsx } from "clsx";

interface StockProduct {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  expectedQuantity: number;
}

interface CategoryOption {
  id: number;
  name: string;
}

export default function StockTakePage() {
  const router = useRouter();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/woocommerce/categories");
      if (!res.ok) return;
      const body = (await res.json()) as CategoryOption[] | { error?: string };
      if (Array.isArray(body)) {
        setCategories(
          body
            .map((c) => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    } catch {
      // categories optional if WC down
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(
        `/api/inventory/stock-take/products?${params.toString()}`,
      );
      const body = (await res.json()) as {
        error?: string;
        products?: StockProduct[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load products");
      const list = body.products ?? [];
      setProducts(list);
      setActuals((prev) => {
        const next: Record<string, string> = {};
        for (const p of list) {
          // Keep typed values when refiltering same products
          next[p.id] = prev[p.id] ?? "";
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, query]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadProducts(), 200);
    return () => window.clearTimeout(t);
  }, [loadProducts]);

  const countedStats = useMemo(() => {
    let counted = 0;
    let variances = 0;
    for (const p of products) {
      const raw = actuals[p.id]?.trim();
      if (raw === "" || raw == null) continue;
      const actual = Number(raw);
      if (!Number.isFinite(actual)) continue;
      counted += 1;
      if (Math.trunc(actual) !== p.expectedQuantity) variances += 1;
    }
    return { counted, variances };
  }, [products, actuals]);

  async function handleComplete() {
    setIsSubmitting(true);
    setError(null);
    try {
      const items: { productId: string; actualQuantity: number }[] = [];
      for (const p of products) {
        const raw = actuals[p.id]?.trim();
        if (raw === "" || raw == null) continue;
        const actualQuantity = Math.trunc(Number(raw));
        if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
          throw new Error(`Invalid actual qty for "${p.name}"`);
        }
        items.push({ productId: p.id, actualQuantity });
      }

      if (items.length === 0) {
        throw new Error("Enter actual quantities for at least one product");
      }

      const res = await fetch("/api/inventory/stock-take/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          items,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        varianceCount?: number;
      };
      if (!res.ok) throw new Error(body.error ?? "Stock take failed");

      router.push("/dashboard/inventory/adjustments");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stock take failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillExpectedAsActual() {
    setActuals((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!next[p.id]?.trim()) {
          next[p.id] = String(p.expectedQuantity);
        }
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            جرد فعلي · Physical Stock Take
          </h1>
          <p className="text-sm text-slate-500">
            Enter counted quantities. Variances create a MANUAL_COUNT adjustment
            and sync to WooCommerce.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Category
          </span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All products</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[200px] flex-[2]">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, SKU, or barcode…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </label>
        <label className="block min-w-[200px] flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional stock-take note"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="button"
          onClick={fillExpectedAsActual}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Fill blanks = expected
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {isLoading
            ? "Loading…"
            : `${products.length} products · ${countedStats.counted} counted · ${countedStats.variances} variance(s)`}
        </p>
        <button
          type="button"
          disabled={isSubmitting || isLoading}
          onClick={() => void handleComplete()}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
        >
          {isSubmitting ? "Saving & syncing…" : "Complete Stock Take"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU / Barcode</th>
                <th className="px-4 py-3 text-right">Expected</th>
                <th className="px-4 py-3 text-right">Actual</th>
                <th className="px-4 py-3 text-right">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    Loading products…
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No products match this filter.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const raw = actuals[p.id]?.trim() ?? "";
                  const actualNum =
                    raw === "" ? null : Math.trunc(Number(raw));
                  const diff =
                    actualNum != null && Number.isFinite(actualNum)
                      ? actualNum - p.expectedQuantity
                      : null;
                  return (
                    <tr
                      key={p.id}
                      className={clsx(
                        "hover:bg-slate-50/80",
                        diff != null &&
                          diff !== 0 &&
                          "bg-amber-50/60",
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {p.name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {p.barcode || p.sku || `WC#${p.wcId}`}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {p.expectedQuantity}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={actuals[p.id] ?? ""}
                          onChange={(e) =>
                            setActuals((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="ml-auto w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                          placeholder="—"
                        />
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-2.5 text-right font-semibold tabular-nums",
                          diff == null && "text-slate-300",
                          diff === 0 && "text-emerald-600",
                          diff != null && diff > 0 && "text-emerald-700",
                          diff != null && diff < 0 && "text-red-700",
                        )}
                      >
                        {diff == null
                          ? "—"
                          : diff > 0
                            ? `+${diff}`
                            : String(diff)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
