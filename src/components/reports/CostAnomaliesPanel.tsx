"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSignedEgp } from "@/lib/pos/money";

type Anomaly = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  buyingCost: number;
  unitCost: number;
  price: number;
  retailPrice: number;
};

export function CostAnomaliesPanel() {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [total, setTotal] = useState(0);
  const [excess, setExcess] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { cost: string; price: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/inventory-valuation");
      const body = (await res.json()) as {
        error?: string;
        anomalies?: Anomaly[];
        summary?: { excessCost?: number; anomalyCount?: number };
      };
      if (!res.ok) throw new Error(body.error ?? "تعذر تحميل التنبيه");
      const anomalies = body.anomalies ?? [];
      setRows(anomalies);
      setTotal(body.summary?.anomalyCount ?? anomalies.length);
      setExcess(body.summary?.excessCost ?? 0);
      setDrafts(
        Object.fromEntries(
          anomalies.map((row) => [
            row.id,
            { cost: String(row.buyingCost), price: String(row.price) },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل التنبيه");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(row: Anomaly) {
    const draft = drafts[row.id];
    const buyingCost = Number(draft?.cost);
    const price = Number(draft?.price);
    if (!Number.isFinite(buyingCost) || buyingCost < 0 || !Number.isFinite(price) || price < 0) {
      setError("أدخل تكلفة وسعراً صحيحين");
      return;
    }
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/products/${row.id}/purchase-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyingCost, price }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذر الحفظ");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-700 dark:bg-slate-900">
      <div className="border-b border-amber-200 px-4 py-3 text-right dark:border-amber-800">
        <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
          ⚠️ أصناف تكلفتها أعلى من سعر البيع (Cost &gt; Price Anomalies)
        </h2>
        <p className="mt-1 text-xs text-amber-900 dark:text-amber-100/80">
          {loading
            ? "جاري الفحص…"
            : total === 0
              ? "لا توجد أصناف بتكلفة أعلى من سعر البيع."
              : `${total} صنفاً${rows.length < total ? ` (أول ${rows.length} في الجدول)` : ""}. فرق التكلفة غير المنطقي `}
          {!loading && total > 0 && (
            <span dir="ltr" className="font-semibold text-red-700 dark:text-red-300">
              {formatSignedEgp(-Math.abs(excess))}
            </span>
          )}
        </p>
      </div>
      {error && (
        <p className="px-4 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>
      )}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-amber-950 dark:text-gray-100">
              <tr>
                <th className="px-3 py-2 text-right">الصنف</th>
                <th className="px-3 py-2 text-right">المخزون</th>
                <th className="px-3 py-2 text-right">آخر تكلفة شراء</th>
                <th className="px-3 py-2 text-right">تكلفة القطعة</th>
                <th className="px-3 py-2 text-right">سعر البيع</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-amber-200 dark:border-slate-700">
                  <td className="px-3 py-2 text-slate-900 dark:text-gray-100">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      {row.sku || row.barcode || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-800 dark:text-gray-100">
                    {row.stockQuantity}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-red-700 dark:text-red-300" dir="ltr">
                    {row.unitCost.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={drafts[row.id]?.cost ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            cost: event.target.value,
                            price: current[row.id]?.price ?? String(row.price),
                          },
                        }))
                      }
                      className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={drafts[row.id]?.price ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            cost: current[row.id]?.cost ?? String(row.buyingCost),
                            price: event.target.value,
                          },
                        }))
                      }
                      className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void save(row)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === row.id ? "جاري الحفظ…" : "تصحيح"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
