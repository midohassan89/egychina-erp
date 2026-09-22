"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  lineTotal: string;
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function pickBestProduct(
  products: ProductOption[],
  query: string,
): ProductOption | undefined {
  const q = query.trim().toLowerCase();
  if (!q || products.length === 0) return undefined;
  const exact = products.find(
    (p) =>
      p.barcode?.toLowerCase() === q ||
      p.sku?.toLowerCase() === q ||
      p.name.toLowerCase() === q,
  );
  return exact ?? products[0];
}

async function fetchLastPurchaseCost(productId: string): Promise<number> {
  try {
    const res = await fetch(
      `/api/inventory/unit-cost?productId=${encodeURIComponent(productId)}&purchaseOnly=1`,
    );
    if (!res.ok) return 0;
    const body = (await res.json()) as { unitCost?: number };
    const cost = Number(body.unitCost);
    return Number.isFinite(cost) && cost >= 0 ? roundMoney(cost) : 0;
  } catch {
    return 0;
  }
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusQtyKeyRef = useRef<string | null>(null);
  const qtyInputRefs = useRef(new Map<string, HTMLInputElement>());
  const costInputRefs = useRef(new Map<string, HTMLInputElement>());
  const totalInputRefs = useRef(new Map<string, HTMLInputElement>());

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
            products?: ProductOption[];
          };
          setProductHits(body.products ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [productQuery]);

  // After a product is added, focus its Quantity field
  useEffect(() => {
    const key = focusQtyKeyRef.current;
    if (!key) return;
    focusQtyKeyRef.current = null;
    const focus = () => {
      const el = qtyInputRefs.current.get(key);
      if (!el) return;
      el.focus();
      el.select();
    };
    requestAnimationFrame(focus);
  }, [lines]);

  const totalAmount = useMemo(
    () =>
      roundMoney(
        lines.reduce((sum, line) => {
          const stored = Number(line.lineTotal);
          if (Number.isFinite(stored)) return sum + stored;
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

  const addProduct = useCallback(async (product: ProductOption) => {
    const lastCost = await fetchLastPurchaseCost(product.id);

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        focusQtyKeyRef.current = existing.key;
        const qty = Math.max(
          1,
          (Math.floor(Number(existing.quantity)) || 0) + 1,
        );
        const cost = Number(existing.unitCost) || 0;
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: String(qty),
                lineTotal: String(roundMoney(qty * cost)),
              }
            : l,
        );
      }

      const key = newKey();
      focusQtyKeyRef.current = key;
      const qty = 1;
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          quantity: "1",
          unitCost: String(lastCost),
          lineTotal: String(roundMoney(qty * lastCost)),
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
    setError(null);
  }, []);

  // Prefill line from Reports "Order Now" (?productId=)
  useEffect(() => {
    const productId = searchParams.get("productId")?.trim();
    if (!productId || prefilledRef.current) return;
    prefilledRef.current = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/unit-cost?productId=${encodeURIComponent(productId)}&purchaseOnly=1`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          productId?: string;
          name?: string;
          unitCost?: number;
        };
        if (!body.productId) return;
        const cost = Number(body.unitCost) || 0;
        setLines((prev) => {
          if (prev.some((l) => l.productId === body.productId)) return prev;
          const key = newKey();
          focusQtyKeyRef.current = key;
          return [
            ...prev,
            {
              key,
              productId: body.productId!,
              productName: body.name ?? "Reorder item",
              quantity: "1",
              unitCost: String(cost),
              lineTotal: String(roundMoney(1 * cost)),
            },
          ];
        });
      } catch {
        // ignore prefill errors
      }
    })();
  }, [searchParams]);

  function updateQuantity(key: string, quantity: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(quantity)) || 0;
        const cost = Number(line.unitCost) || 0;
        return {
          ...line,
          quantity,
          lineTotal: String(roundMoney(qty * cost)),
        };
      }),
    );
  }

  function updateUnitCost(key: string, unitCost: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(line.quantity)) || 0;
        const cost = Number(unitCost) || 0;
        return {
          ...line,
          unitCost,
          lineTotal: String(roundMoney(qty * cost)),
        };
      }),
    );
  }

  function updateLineTotal(key: string, lineTotal: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(line.quantity)) || 0;
        const total = Number(lineTotal) || 0;
        const unitCost = qty > 0 ? roundMoney(total / qty) : 0;
        return {
          ...line,
          lineTotal,
          unitCost: String(unitCost),
        };
      }),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
    qtyInputRefs.current.delete(key);
    costInputRefs.current.delete(key);
    totalInputRefs.current.delete(key);
  }

  function focusUnitCost(key: string) {
    const el = costInputRefs.current.get(key);
    if (!el) return;
    el.focus();
    el.select();
  }

  function focusLineTotal(key: string) {
    const el = totalInputRefs.current.get(key);
    if (!el) return;
    el.focus();
    el.select();
  }

  async function handleSearchKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();

    const q = productQuery.trim();
    if (!q) return;

    let product = pickBestProduct(productHits, q);

    if (!product) {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/products?page=1&perPage=15&q=${encodeURIComponent(q)}`,
        );
        const body = (await res.json()) as { products?: ProductOption[] };
        product = pickBestProduct(body.products ?? [], q);
      } finally {
        setSearching(false);
      }
    }

    if (!product) {
      setError(`No product found for "${q}"`);
      return;
    }

    await addProduct(product);
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
          Scan or search a product, press Enter to add it, then enter quantity
          and cost. Receiving stock syncs to WooCommerce in one batch.
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
              ref={searchInputRef}
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => void handleSearchKeyDown(e)}
              placeholder="Scan barcode or search name / SKU — press Enter to add"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              autoComplete="off"
            />
            {(productHits.length > 0 || searching) && productQuery.trim() && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">
                    Searching…
                  </li>
                ) : (
                  productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void addProduct(p)}
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
                  <th className="w-24 py-2 px-2">Qty</th>
                  <th className="w-32 py-2 px-2">Unit cost</th>
                  <th className="w-32 py-2 px-2">Total</th>
                  <th className="w-12 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Scan or search and press Enter to add products
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.key}>
                      <td className="py-3 pr-3 font-medium text-slate-900">
                        {line.productName}
                      </td>
                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            if (el) qtyInputRefs.current.set(line.key, el);
                            else qtyInputRefs.current.delete(line.key);
                          }}
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateQuantity(line.key, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusUnitCost(line.key);
                              return;
                            }
                            if (e.key === "Tab" && !e.shiftKey) {
                              // Let Tab move to Unit Cost (next field); select for quick edit
                              window.setTimeout(
                                () => focusUnitCost(line.key),
                                0,
                              );
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            if (el) costInputRefs.current.set(line.key, el);
                            else costInputRefs.current.delete(line.key);
                          }}
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) =>
                            updateUnitCost(line.key, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusLineTotal(line.key);
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            if (el) totalInputRefs.current.set(line.key, el);
                            else totalInputRefs.current.delete(line.key);
                          }}
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.lineTotal}
                          onChange={(e) =>
                            updateLineTotal(line.key, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              searchInputRef.current?.focus();
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                          title="Edit bulk total to reverse-calculate unit cost"
                        />
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
                  ))
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
