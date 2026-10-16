"use client";

import { useState } from "react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

export const RETURN_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COLLECTING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ReturnStatusCode = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatusCode, string> = {
  PENDING: "قيد المراجعة",
  CONFIRMED: "تم التأكيد",
  COLLECTING: "جاري الاستلام",
  COMPLETED: "تم الاستلام",
  CANCELLED: "مرفوض/ملغي",
};

export interface ReturnRow {
  id: string;
  orderId: string;
  customerName: string;
  status: string;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    productName: string;
  }[];
}

function displayStatus(status: string): ReturnStatusCode {
  return (RETURN_STATUSES as readonly string[]).includes(status)
    ? (status as ReturnStatusCode)
    : "PENDING";
}

function formatReturnDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReturnsTableInner({ returns }: { returns: ReturnRow[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(returns);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    const previous = rows;
    const prevStatus = previous.find((row) => row.id === id)?.status;
    if (displayStatus(prevStatus ?? "") === status) return;

    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status } : row)),
    );
    setSavingId(id);

    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "تعذر تحديث حالة المرتجع");
      }
      if (body.status) {
        setRows((current) =>
          current.map((row) =>
            row.id === id ? { ...row, status: body.status! } : row,
          ),
        );
      }
      toast(
        `تم تحديث المرتجع إلى: ${RETURN_STATUS_LABELS[displayStatus(body.status ?? status)]}`,
        "success",
      );
    } catch (error) {
      setRows(previous);
      toast(
        error instanceof Error ? error.message : "تعذر تحديث حالة المرتجع",
        "error",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        لا توجد طلبات إرجاع بعد
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <table className="min-w-full text-right text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3">التاريخ</th>
            <th className="px-4 py-3">رقم الطلب</th>
            <th className="px-4 py-3">العميل</th>
            <th className="px-4 py-3">الأصناف والكميات</th>
            <th className="px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-gray-300">
                {formatReturnDate(row.createdAt)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-gray-200" dir="ltr">
                {row.orderId}
              </td>
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                {row.customerName}
              </td>
              <td className="px-4 py-3 text-slate-700 dark:text-gray-200">
                <ul className="space-y-1">
                  {row.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <select
                    value={displayStatus(row.status)}
                    disabled={savingId === row.id}
                    onChange={(event) => {
                      void updateStatus(row.id, event.target.value);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
                  >
                    {RETURN_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {RETURN_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  {savingId === row.id && (
                    <span className="text-xs text-slate-500 dark:text-gray-400">جاري الحفظ…</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReturnsTable({ returns }: { returns: ReturnRow[] }) {
  return (
    <ToastProvider>
      <ReturnsTableInner returns={returns} />
    </ToastProvider>
  );
}
