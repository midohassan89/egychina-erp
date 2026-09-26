"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEGP } from "@/lib/pos/money";

export const ORDER_STATUSES = [
  "قيد الانتظار",
  "جاري التجهيز",
  "مكتمل",
  "ملغي",
] as const;

export interface OrderRow {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  notes: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    productName: string;
  }[];
}

function displayStatus(status: string): (typeof ORDER_STATUSES)[number] {
  if (status === "PENDING") return "قيد الانتظار";
  if (ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return status as (typeof ORDER_STATUSES)[number];
  }
  return "قيد الانتظار";
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

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const [rows, setRows] = useState(orders);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status } : row)),
    );
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not update status");
    } catch (err) {
      setRows(previous);
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        لا توجد طلبات بعد
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Address/Notes</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((order) => (
              <tr key={order.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatOrderDate(order.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {order.customerName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700" dir="ltr">
                  {order.phone}
                </td>
                <td className="max-w-xs px-4 py-3 text-slate-700">
                  <p>{order.address}</p>
                  {order.notes && (
                    <p className="mt-1 text-xs text-slate-500">{order.notes}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <ul className="space-y-1">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.productName} × {item.quantity}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                  {formatEGP(order.totalAmount)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={displayStatus(order.status)}
                      disabled={savingId === order.id}
                      onChange={(event) =>
                        void updateStatus(order.id, event.target.value)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <Link
                      href={`/print/order/${order.id}`}
                      target="_blank"
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
