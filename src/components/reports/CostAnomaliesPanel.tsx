"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatSignedEgp, roundMoney } from "@/lib/pos/money";

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

const HIDDEN_KEY = "cost_anomaly_hidden_ids";

function readHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>) {
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
}

export function CostAnomaliesPanel() {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [total, setTotal] = useState(0);
  const [excess, setExcess] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, { cost: string; price: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHidden(readHidden());
  }, []);

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
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل التنبيه");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => rows.filter((row) => !hidden.has(row.id)),
    [rows, hidden],
  );
  const visibleTotal = visible.length;

  async function patchProduct(id: string, buyingCost: number, price: number) {
    const res = await fetch(`/api/products/${id}/purchase-price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyingCost, price }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "تعذر الحفظ");
  }

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
      await patchProduct(row.id, roundMoney(buyingCost), roundMoney(price));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSavingId(null);
    }
  }

  function targets(): Anomaly[] {
    if (selected.size === 0) return visible;
    return visible.filter((row) => selected.has(row.id));
  }

  async function bulkApply(
    mapper: (row: Anomaly) => { buyingCost: number; price: number },
  ) {
    const list = targets();
    if (list.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const row of list) {
        const next = mapper(row);
        await patchProduct(row.id, next.buyingCost, next.price);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التصحيح الجماعي");
    } finally {
      setBulkBusy(false);
    }
  }

  function hideSelected() {
    const list = targets();
    if (list.length === 0) return;
    setHidden((prev) => {
      const next = new Set(prev);
      for (const row of list) next.add(row.id);
      writeHidden(next);
      return next;
    });
    setSelected(new Set());
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visible.map((row) => row.id)) : new Set());
  }

  if (!loading && total === 0 && visibleTotal === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-right"
      >
        <span className="text-sm font-bold text-amber-950 dark:text-amber-200">
          {loading
            ? "⚠️ جاري فحص تنبيهات التكلفة…"
            : visibleTotal === 0
              ? "⚠️ لا توجد تنبيهات تكلفة ظاهرة"
              : `⚠️ يوجد ${visibleTotal} صنف تكلفتها أعلى من سعر البيع — اضغط هنا لعرضها أو تصحيحها`}
          {!loading && visibleTotal > 0 && (
            <span className="ms-2 text-xs font-semibold text-red-700 dark:text-red-300" dir="ltr">
              {formatSignedEgp(-Math.abs(excess))}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-800" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-800" />
        )}
      </button>

      {open && (
        <>
          {error && (
            <p className="px-4 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}
          {!loading && visible.length > 0 && (
            <div className="space-y-2 border-t border-amber-200 px-3 py-3 dark:border-amber-800">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() =>
                    void bulkApply((row) => {
                      const cost = Number(drafts[row.id]?.cost ?? row.buyingCost);
                      return {
                        buyingCost: roundMoney(cost),
                        price: roundMoney(cost * 1.25),
                      };
                    })
                  }
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  تطبيق هامش ربح +25% فوق التكلفة لتحديث سعر البيع
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() =>
                    void bulkApply((row) => {
                      const price = Number(drafts[row.id]?.price ?? row.price);
                      return {
                        buyingCost: roundMoney(price * 0.8),
                        price: roundMoney(price),
                      };
                    })
                  }
                  className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  تعديل التكلفة لتكون أقل من سعر البيع بـ 20%
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={hideSelected}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  تجاهل / إخفاء من التنبيهات
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-amber-950 dark:text-gray-100">
                    <tr>
                      <th className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.size > 0 && selected.size === visible.length}
                          onChange={(event) => toggleAll(event.target.checked)}
                        />
                      </th>
                      <th className="px-3 py-2 text-right">الصنف</th>
                      <th className="px-3 py-2 text-right">المخزون</th>
                      <th className="px-3 py-2 text-right">آخر تكلفة شراء</th>
                      <th className="px-3 py-2 text-right">سعر التكلفة</th>
                      <th className="px-3 py-2 text-right">سعر البيع</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id} className="border-t border-amber-200 dark:border-slate-700">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={(event) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (event.target.checked) next.add(row.id);
                                else next.delete(row.id);
                                return next;
                              });
                            }}
                          />
                        </td>
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
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void save(row);
                              }
                            }}
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
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void save(row);
                              }
                            }}
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
                            {savingId === row.id ? "جاري الحفظ…" : "حفظ"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
