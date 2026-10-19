"use client";

import { useState } from "react";
import { formatEGP } from "@/lib/pos/money";
import { orderStatusLabel } from "@/lib/orders/status";
import type { PosDeskDriver, PosDeskOrder } from "@/hooks/usePosDesk";

const STEPS: { status: string; label: string }[] = [
  { status: "CONFIRMED", label: "تأكيد" },
  { status: "PREPARING", label: "جاري التجهيز" },
  { status: "SHIPPED", label: "مع السائق" },
  { status: "COMPLETED", label: "مكتمل" },
];

export function PosOnlineDrawer({
  open,
  orders,
  drivers,
  onClose,
  onChanged,
}: {
  open: boolean;
  orders: PosDeskOrder[];
  drivers: PosDeskDriver[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function patch(id: string, body: Record<string, string | null>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "تعذر تحديث الطلب");
        return;
      }
      onChanged();
    } catch {
      setError("تعذر تحديث الطلب");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-start bg-slate-950/50">
      <button type="button" className="h-full flex-1" aria-label="إغلاق" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col bg-white text-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold">طلبات الأونلاين</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            إغلاق
          </button>
        </header>
        {error && <p className="bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">لا توجد طلبات أونلاين</p>
          ) : (
            orders.map((order) => (
              <article key={order.id} className="rounded-xl border border-slate-300 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="text-sm text-slate-700">{order.customerName} · {order.phone}</p>
                    <p className="text-xs text-slate-500">{order.address}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold tabular-nums">{formatEGP(order.totalAmount)}</p>
                    <p className="text-xs font-semibold text-sky-800">{orderStatusLabel(order.status)}</p>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-800">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
                {order.notes ? <p className="mt-1 text-xs text-slate-600">{order.notes}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STEPS.map((step) => (
                    <button
                      key={step.status}
                      type="button"
                      disabled={busyId === order.id || order.status === step.status}
                      onClick={() => void patch(order.id, { status: step.status })}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white disabled:bg-slate-300"
                    >
                      {step.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => window.open(`/print/order/${order.id}?autoprint=1`, "_blank", "noopener")}
                    className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white"
                  >
                    طباعة البون
                  </button>
                </div>
                <label className="mt-2 block text-xs font-semibold text-slate-600">
                  السائق
                  <select
                    value={order.assignedDriverId ?? ""}
                    disabled={busyId === order.id}
                    onChange={(event) =>
                      void patch(order.id, { assignedDriverId: event.target.value || null })
                    }
                    className="pos-input mt-1 w-full rounded-lg border border-slate-400 bg-white px-2 py-2 text-sm font-semibold text-slate-900"
                  >
                    <option value="">بدون سائق</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.username}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
