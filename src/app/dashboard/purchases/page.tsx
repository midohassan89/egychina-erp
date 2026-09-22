"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import { Eye, Pencil, Plus, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface InvoiceRow {
  id: number;
  invoiceNumber: string | null;
  date: string;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  itemCount: number;
}

interface InvoiceDetailItem {
  id: number;
  productName: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

interface InvoiceDetail {
  id: number;
  invoiceNumber: string | null;
  date: string;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
  items: InvoiceDetailItem[];
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "PARTIAL"
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : "bg-red-50 text-red-800 ring-red-200";

  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export default function PurchasesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases");
      const body = (await res.json()) as {
        error?: string;
        invoices?: InvoiceRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load purchases");
      setInvoices(body.invoices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetails(id: number) {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/purchases/${id}`);
      const body = (await res.json()) as {
        error?: string;
        invoice?: InvoiceDetail;
      };
      if (!res.ok || !body.invoice) {
        throw new Error(body.error ?? "Failed to load invoice");
      }
      setDetail(body.invoice);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
          <p className="mt-1 text-slate-500">
            Purchase history, payment status, and stock-receiving invoices
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/purchases/returns"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Purchase Returns
          </Link>
          <Link
            href="/dashboard/purchases/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New Purchase Invoice
          </Link>
        </div>
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
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No purchase invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-900">
                      {inv.invoiceNumber || `PI-${inv.id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(inv.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {inv.supplierName}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEGP(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatEGP(inv.paidAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {isAdmin && (
                          <Link
                            href={`/dashboard/purchases/edit/${inv.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                            title="تعديل فاتورة مشتريات"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => void openDetails(inv.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(detailLoading || detail || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[min(92dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Invoice details
                </h2>
                {detail && (
                  <p className="text-sm text-slate-500">
                    {detail.invoiceNumber || `PI-${detail.id}`} ·{" "}
                    {detail.supplierName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setDetailError(null);
                  setDetailLoading(false);
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {detailLoading && (
                <p className="py-8 text-center text-slate-400">Loading…</p>
              )}
              {detailError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {detailError}
                </p>
              )}
              {detail && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Date</p>
                      <p className="font-medium text-slate-900">
                        {new Date(detail.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="font-semibold tabular-nums text-slate-900">
                        {formatEGP(detail.totalAmount)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Paid</p>
                      <p className="font-semibold tabular-nums text-slate-900">
                        {formatEGP(detail.paidAmount)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Status</p>
                      <div className="mt-0.5">
                        <StatusBadge status={detail.status} />
                      </div>
                    </div>
                  </div>

                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Product</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-2 text-right">Unit cost</th>
                        <th className="py-2 pl-2 text-right">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-slate-900">
                              {item.productName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.barcode || item.sku || "—"}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {formatEGP(item.unitCost)}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-semibold tabular-nums">
                            {formatEGP(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
