"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface AdjustmentRow {
  id: number;
  date: string;
  type: string;
  typeLabel: string;
  notes: string | null;
  userName: string;
  itemCount: number;
  financialImpact: number;
}

export default function InventoryAdjustmentsPage() {
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/adjustments");
      const body = (await res.json()) as {
        error?: string;
        adjustments?: AdjustmentRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load adjustments");
      setRows(body.adjustments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/dashboard/inventory" className="hover:text-brand-700">
              Inventory
            </Link>{" "}
            / Adjustments
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Inventory Adjustments
          </h1>
          <p className="mt-1 text-slate-500">
            Wastage, shortages, production use, and manual counts
          </p>
        </div>
        <Link
          href="/dashboard/inventory/adjustments/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          تسوية جديدة · New Adjustment
        </Link>
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
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Financial impact</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No adjustments yet. Create one to reconcile stock.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const loss = row.financialImpact < 0;
                  const gain = row.financialImpact > 0;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(row.date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                          {row.typeLabel}
                        </span>
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 text-right font-semibold tabular-nums",
                          loss && "text-red-700",
                          gain && "text-emerald-700",
                          !loss && !gain && "text-slate-700",
                        )}
                      >
                        {loss ? "" : gain ? "+" : ""}
                        {formatEGP(row.financialImpact)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {row.itemCount}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.userName}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.notes || "—"}
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
