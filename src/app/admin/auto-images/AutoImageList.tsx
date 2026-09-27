"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export interface MissingImageProduct {
  id: string;
  name: string;
}

const BATCH_DELAY_MS = 1200;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AutoImageList({ products }: { products: MissingImageProduct[] }) {
  const [rows, setRows] = useState(products);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchOne(product: MissingImageProduct): Promise<boolean> {
    setBusyId(product.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
        }),
      });
      const body = (await res.json()) as { error?: string; imageUrl?: string };
      if (!res.ok || !body.imageUrl) {
        throw new Error(body.error ?? "Could not fetch image");
      }
      setRows((current) => current.filter((row) => row.id !== product.id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch image");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function fetchAll() {
    setRunningAll(true);
    setError(null);
    const pending = [...rows];
    for (let index = 0; index < pending.length; index += 1) {
      const product = pending[index];
      const ok = await fetchOne(product);
      if (!ok) break;
      if (index < pending.length - 1) await wait(BATCH_DELAY_MS);
    }
    setRunningAll(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {rows.length} منتج بدون صورة
        </p>
        <button
          type="button"
          disabled={runningAll || busyId != null || rows.length === 0}
          onClick={() => void fetchAll()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          جلب للكل
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          كل المنتجات لديها صورة
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows.map((product) => {
            const busy = busyId === product.id || runningAll;
            return (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-900">
                  {product.name}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void fetchOne(product)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyId === product.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  جلب الصورة
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
