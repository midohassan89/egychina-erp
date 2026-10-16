"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";

export interface MissingImageProduct {
  id: string;
  name: string;
}

type RowState = "pending" | "loading" | "success" | "failed";

interface Row {
  id: string;
  name: string;
  status: RowState;
  url: string | null;
  error: string | null;
}

export function AutoFetchPanel({
  products,
}: {
  products: MissingImageProduct[];
}) {
  const [rows, setRows] = useState<Row[]>(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      status: "pending",
      url: null,
      error: null,
    })),
  );
  const [running, setRunning] = useState(false);

  function patch(id: string, next: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...next } : row)),
    );
  }

  async function startBulkFetch() {
    if (running) return;
    setRunning(true);
    const pending = rows.filter((row) => row.status !== "success");
    for (const product of pending) {
      patch(product.id, { status: "loading", url: null, error: null });
      try {
        const res = await fetch("/api/upload/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            productName: product.name,
          }),
        });
        const body = (await res.json()) as {
          success?: boolean;
          url?: string;
          error?: string;
        };
        if (!res.ok || !body.success || !body.url) {
          patch(product.id, {
            status: "failed",
            url: null,
            error: body.error?.trim() || null,
          });
          continue;
        }
        patch(product.id, { status: "success", url: body.url, error: null });
      } catch {
        patch(product.id, { status: "failed", url: null });
      }
    }
    setRunning(false);
  }

  const remaining = rows.filter((row) => row.status !== "success").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-gray-400">{remaining} منتج بانتظار صورة</p>
        <button
          type="button"
          disabled={running || remaining === 0}
          onClick={() => void startBulkFetch()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {running ? "جاري الجلب…" : "بدء الجلب التلقائي"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          كل المنتجات لديها صورة
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-right font-medium">المنتج</th>
                <th className="px-4 py-3 text-right font-medium">الحالة</th>
                <th className="px-4 py-3 text-right font-medium">الصورة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                    {row.status === "pending" && "في الانتظار"}
                    {row.status === "loading" && (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري الجلب
                      </span>
                    )}
                    {row.status === "success" && (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">تم ✅</span>
                    )}
                    {row.status === "failed" && (
                      <span className="font-semibold text-red-700 dark:text-red-300">
                        فشل ❌
                        {row.error ? (
                          <span className="mt-1 block text-xs font-normal">
                            {row.error}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.url ? (
                      <SafeImage
                        src={row.url}
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="text-slate-300 dark:text-gray-600">—</span>
                    )}
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
