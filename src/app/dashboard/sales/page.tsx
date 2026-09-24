"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Eye, Printer, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
} from "@/lib/pos/paymentMethods";
import { useReceiptPrint } from "@/hooks/useReceiptPrint";
import type { LocalSale, PaymentMethod } from "@/types/woocommerce";

interface OrderRow {
  id: string;
  receiptNumber: string;
  createdAt: string;
  cashierName: string;
  paymentMethod: string;
  total: number;
  status: string;
  isReturn: boolean;
  customerName: string;
  itemCount: number;
  linesSubtotal: number;
  discount: number;
}

interface OrderDetail extends OrderRow {
  lines: {
    id: number;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export default function SalesHistoryPage() {
  const { printReceipt, receiptNode } = useReceiptPrint();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState(""); // "" | "sale" | "return"
  const [q, setQ] = useState("");

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [localSale, setLocalSale] = useState<LocalSale | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "20",
      });
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (typeFilter === "return") params.set("isReturn", "1");
      if (typeFilter === "sale") params.set("isReturn", "0");
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/orders/history?${params.toString()}`);
      const body = (await res.json()) as {
        error?: string;
        orders?: OrderRow[];
        total?: number;
        pageCount?: number;
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load sales");
      setOrders(body.orders ?? []);
      setTotal(body.total ?? 0);
      setPageCount(body.pageCount ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, paymentMethod, startDate, endDate, typeFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) void openDetails(id);
    // Open a sale when the stock ledger links here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetails(orderId: string) {
    setDetailLoading(true);
    setDetail(null);
    setLocalSale(null);
    try {
      const res = await fetch(
        `/api/orders/history?id=${encodeURIComponent(orderId)}`,
      );
      const body = (await res.json()) as {
        error?: string;
        order?: OrderDetail;
        localSale?: LocalSale;
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load order");
      setDetail(body.order ?? null);
      setLocalSale(body.localSale ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleReprint() {
    if (!localSale) return;
    printReceipt(localSale);
  }

  return (
    <>
      <div className="dashboard-print-hide space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales History</h1>
          <p className="mt-1 text-slate-500">
            POS receipts, refunds, and reprint for the thermal printer
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block min-w-[140px]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payment
            </span>
            <select
              value={paymentMethod}
              onChange={(e) => {
                setPage(1);
                setPaymentMethod(e.target.value);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All methods</option>
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.labelEn}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[120px]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(e) => {
                setPage(1);
                setTypeFilter(e.target.value);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All</option>
              <option value="sale">Sales</option>
              <option value="return">Returns</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPage(1);
                setStartDate(e.target.value);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPage(1);
                setEndDate(e.target.value);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block min-w-[180px] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  void load();
                }
              }}
              placeholder="Receipt #, cashier, customer…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              void load();
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Date / Time</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      No sales found. Complete a POS checkout to see history
                      here.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                        {order.receiptNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {order.cashierName}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {paymentMethodLabel(
                          order.paymentMethod as PaymentMethod,
                        )}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 text-right font-semibold tabular-nums",
                          order.isReturn || order.total < 0
                            ? "text-red-700"
                            : "text-slate-900",
                        )}
                      >
                        {formatEGP(order.total)}
                      </td>
                      <td className="px-4 py-3">
                        {order.isReturn ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-inset ring-amber-200">
                            Returned
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetails(order.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              {total} order{total === 1 ? "" : "s"} · page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount || isLoading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {(detail || detailLoading) && (
        <div className="dashboard-print-hide fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[min(92dvh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Order details
                </h2>
                <p className="text-sm text-slate-500">
                  {detail
                    ? `${detail.receiptNumber} · ${new Date(detail.createdAt).toLocaleString()}`
                    : "Loading…"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setLocalSale(null);
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detailLoading || !detail ? (
                <p className="text-sm text-slate-400">Loading receipt…</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                      Cashier: {detail.cashierName}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                      {paymentMethodLabel(
                        detail.paymentMethod as PaymentMethod,
                      )}
                    </span>
                    {detail.isReturn && (
                      <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                        Returned / Refunded
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-600">
                    Customer: {detail.customerName}
                  </p>

                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-2 pr-2">Item</th>
                        <th className="py-2 pr-2 text-right">Qty</th>
                        <th className="py-2 pr-2 text-right">Price</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2 pr-2 font-medium text-slate-900">
                            {line.name}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {formatEGP(line.unitPrice)}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {formatEGP(line.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        {formatEGP(detail.linesSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Discount</span>
                      <span className="tabular-nums">
                        {formatEGP(detail.discount)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                      <span>Grand total</span>
                      <span className="tabular-nums">
                        {formatEGP(detail.total)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setLocalSale(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!localSale}
                onClick={handleReprint}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
              >
                <Printer className="h-4 w-4" />
                إعادة طباعة الفاتورة · Reprint
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptNode}
    </>
  );
}
