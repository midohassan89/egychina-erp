"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";

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
  quantity: string;
  unitCost: string;
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function NewPurchaseInvoicePage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-slate-500">Loading purchase form…</p>
      }
    >
      <NewPurchaseInvoicePageInner />
    </Suspense>
  );
}

function NewPurchaseInvoicePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const prefilledRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const body = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliers(body.suppliers ?? []);
    })();
  }, []);

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
            products?: {
              id: string;
              wcId: number;
              name: string;
              sku: string | null;
              barcode: string | null;
              stockQuantity: number;
            }[];
          };
          setProductHits(body.products ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [productQuery]);

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

  const paid = roundMoney(Math.max(0, Number(paidAmount) || 0));
  const dueAmount = roundMoney(Math.max(0, totalAmount - paid));
  const previewStatus =
    dueAmount <= 0.001 ? "PAID" : paid > 0.001 ? "PARTIAL" : "UNPAID";

  const addProduct = useCallback((product: ProductOption) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: String(Math.max(1, (Math.floor(Number(l.quantity)) || 0) + 1)),
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
          quantity: "1",
          unitCost: "0",
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
  }, []);

  // Prefill line from Reports "Order Now" (?productId=)
  useEffect(() => {
    const productId = searchParams.get("productId")?.trim();
    if (!productId || prefilledRef.current) return;
    prefilledRef.current = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/unit-cost?productId=${encodeURIComponent(productId)}`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          productId?: string;
          name?: string;
          unitCost?: number;
        };
        if (!body.productId) return;
        setLines((prev) => {
          if (prev.some((l) => l.productId === body.productId)) return prev;
          return [
            ...prev,
            {
              key: newKey(),
              productId: body.productId!,
              productName: body.name ?? "Reorder item",
              quantity: "1",
              unitCost: String(body.unitCost ?? 0),
            },
          ];
        });
      } catch {
        // ignore prefill errors
      }
    })();
  }, [searchParams]);

  function updateLine(
    key: string,
    patch: Partial<Pick<LineDraft, "quantity" | "unitCost">>,
  ) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessNote(null);

    if (!supplierId) {
      setError("Select a supplier");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one product line");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim() || null,
          date,
          paidAmount: Math.min(
            Math.max(0, Number(paidAmount) || 0),
            totalAmount,
          ),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Math.floor(Number(line.quantity)),
            unitCost: Number(line.unitCost),
          })),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        invoice?: { id: number };
        wooSynced?: number;
        wooError?: string | null;
        stockUpdated?: number;
      };

      if (!res.ok) throw new Error(body.error ?? "Could not save invoice");

      const note = body.wooError
        ? `Invoice saved & local stock updated (${body.stockUpdated} products). WooCommerce sync warning: ${body.wooError}`
        : `Invoice saved. Stock updated locally and on WooCommerce (${body.wooSynced} products).`;

      setSuccessNote(note);
      window.setTimeout(() => {
        router.push("/dashboard/purchases");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Purchases
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          New Purchase Invoice
        </h1>
        <p className="mt-1 text-slate-500">
          Receiving stock increases local Prisma quantity and syncs to
          WooCommerce in one batch.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Supplier
            </span>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <Link
                href="/dashboard/suppliers"
                className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                Create a supplier first
              </Link>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Invoice # (optional)
            </span>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Supplier reference"
            />
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
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Line items</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search product by name, barcode, or SKU…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            {(productHits.length > 0 || searching) && productQuery.trim() && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
                ) : (
                  productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-brand-50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-900">
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {p.barcode || p.sku || `WC #${p.wcId}`} · stock{" "}
                            {p.stockQuantity}
                          </span>
                        </span>
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="w-28 py-2 px-2">Qty</th>
                  <th className="w-36 py-2 px-2">Unit cost</th>
                  <th className="w-32 py-2 px-2 text-right">Line total</th>
                  <th className="w-12 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Search and add products above
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const qty = Math.floor(Number(line.quantity)) || 0;
                    const cost = Number(line.unitCost) || 0;
                    const lineTotal = roundMoney(qty * cost);
                    return (
                      <tr key={line.key}>
                        <td className="py-3 pr-3 font-medium text-slate-900">
                          {line.productName}
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) =>
                              updateLine(line.key, { unitCost: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="px-2 py-3 text-right font-semibold tabular-nums text-slate-900">
                          {formatEGP(lineTotal)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
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

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Invoice total
              </span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {formatEGP(totalAmount)}
              </span>
            </div>

            <label className="block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Amount paid now (EGP)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">
                Due / A/P increase:{" "}
                <strong className="tabular-nums text-slate-900">
                  {formatEGP(dueAmount)}
                </strong>
              </span>
              <span className="font-semibold text-slate-800">
                Status: {previewStatus}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {successNote && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successNote}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href="/dashboard/purchases"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isSubmitting ? "Saving…" : "Save & Restock"}
          </button>
        </div>
      </form>
    </div>
  );
}
