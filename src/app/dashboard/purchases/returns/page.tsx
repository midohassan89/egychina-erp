"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, Trash2, Undo2, X } from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";

interface ReturnRow {
  id: number;
  date: string;
  supplierName: string;
  totalAmount: number;
  notes: string | null;
  itemCount: number;
}

interface SupplierOption {
  id: number;
  name: string;
}

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
  stockQuantity: number;
  quantity: string;
  unitCost: string;
}

function newKey() {
  return `ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases/returns");
      const body = (await res.json()) as {
        error?: string;
        returns?: ReturnRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load returns");
      setReturns(body.returns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formOpen) return;
    void (async () => {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const body = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliers(body.suppliers ?? []);
    })();
  }, [formOpen]);

  useEffect(() => {
    const q = productQuery.trim();
    if (!formOpen || q.length < 1) {
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
          const body = (await res.json()) as { products?: ProductOption[] };
          setProductHits(body.products ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [productQuery, formOpen]);

  const totalAmount = useMemo(
    () =>
      roundMoney(
        lines.reduce((sum, line) => {
          const qty = Math.floor(Number(line.quantity)) || 0;
          const cost = Number(line.unitCost) || 0;
          return sum + qty * cost;
        }, 0),
      ),
    [lines],
  );

  function openForm() {
    setFormError(null);
    setSupplierId("");
    setDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setLines([]);
    setProductQuery("");
    setProductHits([]);
    setFormOpen(true);
  }

  function addProduct(product: ProductOption) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: String(
                  Math.max(1, (Math.floor(Number(l.quantity)) || 0) + 1),
                ),
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
          stockQuantity: product.stockQuantity,
          quantity: "1",
          unitCost: "0",
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError("Select a supplier");
      return;
    }
    if (lines.length === 0) {
      setFormError("Add at least one product line");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchases/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          date,
          notes: notes.trim() || null,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Math.floor(Number(line.quantity)),
            unitCost: Number(line.unitCost),
          })),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        wooError?: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not save return");

      setFormOpen(false);
      await load();
      if (body.wooError) {
        setError(`Return saved locally. WooCommerce: ${body.wooError}`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Purchases
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Purchase Returns
          </h1>
          <p className="mt-1 text-slate-500">
            Return to vendor — reduces supplier balance and stock (local + WC)
          </p>
        </div>
        <button
          type="button"
          onClick={openForm}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          <Undo2 className="h-4 w-4" />
          مرتجع مشتريات جديد
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-center">Lines</th>
                <th className="px-4 py-3 text-right">Total Amount</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No purchase returns yet.
                  </td>
                </tr>
              ) : (
                returns.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-900">
                      PR-{row.id}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(row.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.supplierName}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600">
                      {row.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEGP(row.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="flex max-h-[min(94dvh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-amber-950">
                  مرتجع مشتريات جديد · New Purchase Return
                </h2>
                <p className="text-sm text-amber-800/80">
                  Stock and supplier balance will decrease on save
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-2 text-amber-700 hover:bg-amber-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Supplier
                    </span>
                    <select
                      required
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="">Select supplier…</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
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
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Notes (optional)
                  </span>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Reason / reference"
                  />
                </label>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search product by name, barcode, or SKU…"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  {(productHits.length > 0 || searching) &&
                    productQuery.trim() && (
                      <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {searching && productHits.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate-400">
                            Searching…
                          </li>
                        ) : (
                          productHits.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => addProduct(p)}
                                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-amber-50"
                              >
                                <span>
                                  <span className="block text-sm font-medium text-slate-900">
                                    {p.name}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {p.barcode || p.sku || `WC #${p.wcId}`} ·
                                    stock {p.stockQuantity}
                                  </span>
                                </span>
                                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="w-24 px-2 py-2">Qty</th>
                        <th className="w-32 px-2 py-2">Unit cost</th>
                        <th className="w-28 px-2 py-2 text-right">Line</th>
                        <th className="w-10 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-8 text-center text-slate-400"
                          >
                            Search and add products to return
                          </td>
                        </tr>
                      ) : (
                        lines.map((line) => {
                          const qty = Math.floor(Number(line.quantity)) || 0;
                          const cost = Number(line.unitCost) || 0;
                          return (
                            <tr key={line.key}>
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-slate-900">
                                  {line.productName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  On hand {line.stockQuantity}
                                </p>
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={line.stockQuantity}
                                  step={1}
                                  value={line.quantity}
                                  onChange={(e) =>
                                    setLines((prev) =>
                                      prev.map((l) =>
                                        l.key === line.key
                                          ? { ...l, quantity: e.target.value }
                                          : l,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-amber-500"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
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
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-amber-500"
                                />
                              </td>
                              <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                                {formatEGP(roundMoney(qty * cost))}
                              </td>
                              <td className="py-2.5 pr-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLines((prev) =>
                                      prev.filter((l) => l.key !== line.key),
                                    )
                                  }
                                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
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

                <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <span className="text-sm text-slate-300">Return total</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatEGP(totalAmount)}
                  </span>
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-slate-300"
                >
                  {isSubmitting ? "Saving…" : "Save Return & Sync Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
