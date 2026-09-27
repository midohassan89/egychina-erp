"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export interface TranslateRow {
  type: "product" | "category";
  id: string;
  name: string;
}

const BATCH_DELAY_MS = 1000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowKey(row: TranslateRow) {
  return `${row.type}:${row.id}`;
}

export function AutoTranslateList({ rows: initialRows }: { rows: TranslateRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function translateOne(row: TranslateRow): Promise<boolean> {
    const key = rowKey(row);
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/auto-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: row.type,
          id: row.id,
          name: row.name,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        nameEn?: string;
        nameZh?: string;
      };
      if (!res.ok || !body.nameEn || !body.nameZh) {
        throw new Error(body.error ?? "Could not translate");
      }
      setRows((current) => current.filter((item) => rowKey(item) !== key));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not translate");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function translateAll() {
    setRunningAll(true);
    setError(null);
    const pending = [...rows];
    for (let index = 0; index < pending.length; index += 1) {
      const ok = await translateOne(pending[index]);
      if (!ok) break;
      if (index < pending.length - 1) await wait(BATCH_DELAY_MS);
    }
    setRunningAll(false);
  }

  const busy = runningAll || busyKey != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{rows.length} عنصر بدون ترجمة</p>
        <button
          type="button"
          disabled={busy || rows.length === 0}
          onClick={() => void translateAll()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {runningAll && <Loader2 className="h-4 w-4 animate-spin" />}
          ترجمة الكل أوتوماتيكياً
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                  كل الأسماء مترجمة
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = rowKey(row);
                const rowBusy = busyKey === key;
                return (
                  <tr key={key}>
                    <td className="px-4 py-3 text-slate-500">
                      {row.type === "product" ? "منتج" : "قسم"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3 text-left">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void translateOne(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {rowBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        ترجمة
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
