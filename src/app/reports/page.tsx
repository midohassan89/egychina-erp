"use client";

import { useEffect, useMemo, useState } from "react";
import { getSales } from "@/lib/cache/indexeddb";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import type { LocalSale } from "@/types/woocommerce";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ReportsPage() {
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSales()
      .then(setSales)
      .finally(() => setIsLoading(false));
  }, []);

  const today = useMemo(() => {
    const cutoff = startOfToday().getTime();
    return sales.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
  }, [sales]);

  const summary = useMemo(() => {
    const total = roundMoney(today.reduce((sum, s) => sum + s.total, 0));
    const items = today.reduce((sum, s) => sum + s.lines.length, 0);
    const avg = today.length ? roundMoney(total / today.length) : 0;
    const topItems = new Map<string, { name: string; qty: number; total: number }>();

    for (const sale of today) {
      for (const line of sale.lines) {
        const current = topItems.get(line.name) ?? {
          name: line.name,
          qty: 0,
          total: 0,
        };
        current.qty += line.qty;
        current.total += line.lineTotal;
        topItems.set(line.name, current);
      }
    }

    return {
      tickets: today.length,
      total,
      avg,
      items,
      top: [...topItems.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    };
  }, [today]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-slate-500">Today&apos;s POS activity from the local ledger</p>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading reports…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Tickets today" value={String(summary.tickets)} />
            <Stat label="Revenue today" value={formatEGP(summary.total)} />
            <Stat label="Average ticket" value={formatEGP(summary.avg)} />
            <Stat label="Line items" value={String(summary.items)} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Top items today</h2>
            {summary.top.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No sales yet today.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {summary.top.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <span className="text-slate-500">
                      {item.qty.toFixed(item.qty % 1 ? 3 : 0)} · {formatEGP(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
