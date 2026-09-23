"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface FlaggedSale {
  id: string;
  localId: string | null;
  shiftId: number | null;
  total: number;
  paymentMethod: string;
  isReturn: boolean;
  customerName: string | null;
  cashierName: string | null;
  auditReason: string | null;
  createdAt: string;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SaleAuditPage() {
  const [sales, setSales] = useState<FlaggedSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales/audit");
      const body = (await res.json()) as {
        error?: string;
        sales?: FlaggedSale[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load audit queue");
      setSales(body.sales ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(saleId: string) {
    setResolvingId(saleId);
    setError(null);
    try {
      const res = await fetch("/api/sales/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not resolve sale");
      setSales((rows) => rows.filter((row) => row.id !== saleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve sale");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sale Audit</h1>
        <p className="mt-1 text-slate-500">
          Orders saved despite a business-rule issue. Review the reason, correct
          stock if needed, then mark the order as audited.
        </p>
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
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No orders are waiting for audit.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="align-top hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-900">
                        {sale.id.slice(0, 10)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {sale.cashierName ?? "Unknown cashier"}
                        {sale.isReturn ? " · return" : ""}
                        {sale.paymentMethod ? ` · ${sale.paymentMethod}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {sale.shiftId != null ? `#${sale.shiftId}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(sale.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEGP(sale.total)}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="inline-flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-950">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{sale.auditReason || "Flagged for review"}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={resolvingId === sale.id}
                        onClick={() => void resolve(sale.id)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {resolvingId === sale.id ? "Saving…" : "Mark as Audited"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
