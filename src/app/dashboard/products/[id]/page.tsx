"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { formatEGP } from "@/lib/pos/money";
import type { StockLedgerMovement, StockLedgerType } from "@/lib/inventory/stockLedger";

interface LedgerResponse {
  product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    stockQuantity: number;
  };
  movements: StockLedgerMovement[];
}

const BADGE: Record<
  StockLedgerType,
  { label: string; className: string }
> = {
  PURCHASE: {
    label: "Purchase 📥",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  SALE: {
    label: "Sale 📤",
    className: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  STAFF_MEAL: {
    label: "Staff Meal 🍽️",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  SALE_RETURN: {
    label: "Sale return 📥",
    className: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  },
  PURCHASE_RETURN: {
    label: "Purchase return 📤",
    className: "bg-orange-50 text-orange-800 ring-orange-200",
  },
  ADJUSTMENT: {
    label: "Adjustment",
    className: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  OPENING: {
    label: "Opening Balance",
    className: "bg-slate-50 text-slate-700 ring-slate-300",
  },
  OPENING_BALANCE: {
    label: "رصيد افتتاحي",
    className: "bg-purple-100 text-purple-800 ring-purple-200",
  },
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProductStockLedgerPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        const query = params.toString();
        const res = await fetch(
          query
            ? `/api/products/${productId}/ledger?${query}`
            : `/api/products/${productId}/ledger`,
        );
        const body = (await res.json()) as LedgerResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load ledger");
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ledger");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Products
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Stock Ledger · كارت الصنف
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {data?.product.name ?? "Product"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data?.product.barcode || data?.product.sku || "No barcode"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            On hand
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {data?.product.stockQuantity ?? "—"}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Inventory statement
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Newest movements first. A start date adds the opening balance
                from every movement before that day.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Start date
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  End date
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date & time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Party / Entity</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Qty in</th>
                <th className="px-4 py-3 text-right">Qty out</th>
                <th className="px-4 py-3 text-right">Unit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    Loading ledger…
                  </td>
                </tr>
              ) : !data || data.movements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No stock movements yet.
                  </td>
                </tr>
              ) : (
                data.movements.map((row) => {
                  const badge = BADGE[row.type];
                  return (
                    <tr
                      key={row.id}
                      className={
                        row.type === "OPENING"
                          ? "bg-slate-50/90"
                          : "hover:bg-slate-50/80"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatWhen(row.occurredAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        {row.note ? (
                          <p className="mt-1 text-xs text-slate-500">{row.note}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.party || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="text-brand-700 hover:underline"
                          >
                            {row.reference}
                          </Link>
                        ) : (
                          row.reference
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
                        {row.qtyIn > 0 ? `+${row.qtyIn}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-red-700">
                        {row.qtyOut > 0 ? `−${row.qtyOut}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {row.unitAmount == null ? "—" : formatEGP(row.unitAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-slate-900">
                        {row.runningBalance}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
