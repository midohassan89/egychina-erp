"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { getSales } from "@/lib/cache/indexeddb";
import { SaleSyncStatusBadge } from "@/components/pos/SaleSyncStatus";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import type { LocalSale } from "@/types/woocommerce";

export default function AccountingPage() {
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSales()
      .then(setSales)
      .finally(() => setIsLoading(false));
  }, []);

  const totals = useMemo(() => {
    const cash = sales
      .filter((s) => s.paymentMethod === "cash")
      .reduce((sum, s) => sum + s.total, 0);
    const card = sales
      .filter((s) => s.paymentMethod !== "cash")
      .reduce((sum, s) => sum + s.total, 0);
    return {
      count: sales.length,
      cash: roundMoney(cash),
      card: roundMoney(card),
      all: roundMoney(cash + card),
      pending: sales.filter((s) => s.syncStatus !== "synced").length,
    };
  }, [sales]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounting</h1>
        <p className="mt-1 text-slate-500">
          Local sales ledger. WooCommerce orders are created at checkout when online.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales" value={String(totals.count)} />
        <Stat label="Cash" value={formatEGP(totals.cash)} />
        <Stat label="Card" value={formatEGP(totals.card)} />
        <Stat label="Total" value={formatEGP(totals.all)} />
      </div>

      {totals.pending > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {totals.pending} sale{totals.pending === 1 ? "" : "s"} waiting to sync
          to WooCommerce.
        </p>
      )}

      {isLoading ? (
        <p className="text-slate-400">Loading ledger…</p>
      ) : sales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Receipt className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-slate-600">No sales recorded yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Time</th>
                <th className="px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="px-4 py-3 font-medium text-slate-600">Pay</th>
                <th className="px-4 py-3 font-medium text-slate-600">Total</th>
                <th className="px-4 py-3 font-medium text-slate-600">WooCommerce</th>
                <th className="px-4 py-3 font-medium text-slate-600">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(sale.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{sale.customerName}</td>
                  <td className="px-4 py-3 capitalize">{sale.paymentMethod}</td>
                  <td className="px-4 py-3 font-semibold">
                    {formatEGP(sale.total)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {sale.wooOrderId ? `#${sale.wooOrderId}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <SaleSyncStatusBadge status={sale.syncStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
