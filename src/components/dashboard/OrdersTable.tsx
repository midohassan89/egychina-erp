"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEGP } from "@/lib/pos/money";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  MANUAL_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  normalizeOrderStatus,
  orderStatusLabel,
  type OrderStatusCode,
} from "@/lib/orders/status";

export interface OrderRow {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  notes: string | null;
  deliveryTime: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    productName: string;
  }[];
}

function displayStatus(status: string): OrderStatusCode {
  return normalizeOrderStatus(status) ?? "PENDING";
}

function statusChoices(status: string): OrderStatusCode[] {
  const current = displayStatus(status);
  if (current === "PARTIALLY_RETURNED" || current === "RETURNED") {
    return [current, ...MANUAL_ORDER_STATUSES];
  }
  return [...MANUAL_ORDER_STATUSES];
}

function formatOrderDate(iso: string): string {
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

function OrdersTableInner({ orders }: { orders: OrderRow[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(orders);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    const previous = rows;
    const prevStatus = previous.find((r) => r.id === id)?.status;
    if (displayStatus(prevStatus ?? "") === status) return;

    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status } : row)),
    );
    setSavingId(id);

    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      let body: { error?: string; status?: string } = {};
      try {
        body = (await res.json()) as { error?: string; status?: string };
      } catch {
        throw new Error(
          res.status === 401 || res.redirected
            ? "انتهت الجلسة — سجّل الدخول مرة أخرى"
            : `فشل التحديث (HTTP ${res.status})`,
        );
      }

      if (!res.ok) {
        throw new Error(body.error ?? "تعذر تحديث الحالة");
      }

      if (body.status) {
        setRows((current) =>
          current.map((row) =>
            row.id === id ? { ...row, status: body.status! } : row,
          ),
        );
      }

      toast(`تم تحديث الحالة إلى: ${orderStatusLabel(status)}`, "success");
    } catch (err) {
      setRows(previous);
      toast(
        err instanceof Error ? err.message : "تعذر تحديث الحالة",
        "error",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        لا توجد طلبات بعد
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">العنوان / ملاحظات</th>
              <th className="px-4 py-3">الأصناف</th>
              <th className="px-4 py-3">الإجمالي</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {rows.map((order) => (
              <tr key={order.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-gray-300">
                  {formatOrderDate(order.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                  {order.customerName}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-gray-200"
                  dir="ltr"
                >
                  {order.phone}
                </td>
                <td className="max-w-xs px-4 py-3 text-slate-700 dark:text-gray-200">
                  <p>{order.address}</p>
                  {order.deliveryTime && (
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-gray-200">
                      وقت التوصيل المحدد: {formatOrderDate(order.deliveryTime)}
                    </p>
                  )}
                  {order.notes && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{order.notes}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-gray-200">
                  <ul className="space-y-1">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.productName} × {item.quantity}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                  {formatEGP(order.totalAmount)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={displayStatus(order.status)}
                      disabled={savingId === order.id}
                      onChange={(event) => {
                        event.preventDefault();
                        void updateStatus(order.id, event.target.value);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
                    >
                      {statusChoices(order.status).map((status) => (
                        <option
                          key={status}
                          value={status}
                          disabled={
                            status === "PARTIALLY_RETURNED" ||
                            status === "RETURNED"
                          }
                        >
                          {ORDER_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    {savingId === order.id && (
                      <span className="text-xs text-slate-500 dark:text-gray-400">جاري الحفظ…</span>
                    )}
                    <Link
                      href={`/print/order/${order.id}`}
                      target="_blank"
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      طباعة
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  return (
    <ToastProvider>
      <OrdersTableInner orders={orders} />
    </ToastProvider>
  );
}
