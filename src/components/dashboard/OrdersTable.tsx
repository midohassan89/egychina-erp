"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEGP } from "@/lib/pos/money";
import { SafeImage } from "@/components/ui/SafeImage";
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
  orderNumber?: string | null;
  customerName: string;
  phone: string;
  address: string;
  notes: string | null;
  deliveryTime: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  couponCode?: string | null;
  couponDiscount?: number;
  pointsRedeemed?: number | null;
  pointsDiscount?: number;
  shippingFee?: number;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  items: {
    id: string;
    quantity: number;
    price?: number;
    productName: string;
    imageUrl?: string | null;
    isWeighed?: boolean;
    packSize?: number;
  }[];
}

export interface DriverOption {
  id: string;
  username: string;
}

function displayOrderNumber(order: { id: string; orderNumber?: string | null }) {
  return order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`;
}

const STATUS_FILTERS: { id: string; label: string; statuses: string[] }[] = [
  { id: "", label: "الكل", statuses: [] },
  { id: "PENDING", label: "قيد الانتظار", statuses: ["PENDING"] },
  { id: "CONFIRMED", label: "مؤكد", statuses: ["CONFIRMED"] },
  { id: "PREPARING", label: "جاري التجهيز", statuses: ["PREPARING"] },
  { id: "SHIPPED", label: "في الطريق", statuses: ["SHIPPED"] },
  { id: "COMPLETED", label: "مكتمل", statuses: ["COMPLETED", "DELIVERED"] },
  { id: "CANCELLED", label: "ملغي", statuses: ["CANCELLED"] },
];

function formatDelivery(order: { notes: string | null; deliveryTime: string | null }) {
  const raw = order.notes?.trim() ?? "";
  const prefixed = raw.match(/^deliveryTime:\s*(.*)$/i);
  const token = (prefixed?.[1] ?? "").trim();
  const asap = token.toUpperCase() === "ASAP" || raw.toUpperCase() === "ASAP";
  if (asap && !order.deliveryTime) return "موعد التوصيل: في أقرب وقت";
  const iso = order.deliveryTime || (token && token.toUpperCase() !== "ASAP" ? token : "");
  const date = iso ? new Date(iso) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return `موعد التوصيل: ${date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  if (asap) return "موعد التوصيل: في أقرب وقت";
  return raw || null;
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

function OrdersTableInner({
  orders,
  drivers,
}: {
  orders: OrderRow[];
  drivers: DriverOption[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState(orders);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const needle = query.trim().toLowerCase();
  const statusGroup = STATUS_FILTERS.find((item) => item.id === statusFilter);
  const visible = rows.filter((order) => {
    if (statusGroup && statusGroup.statuses.length > 0 && !statusGroup.statuses.includes(displayStatus(order.status))) {
      return false;
    }
    if (dateFilter && !order.createdAt.startsWith(dateFilter)) return false;
    if (!needle) return true;
    return [order.orderNumber, order.customerName, order.phone, order.id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

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

  async function assignDriver(id: string, driverId: string) {
    const previous = rows;
    const driver = drivers.find((item) => item.id === driverId);
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              assignedDriverId: driverId || null,
              assignedDriverName: driver?.username ?? null,
            }
          : row,
      ),
    );
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedDriverId: driverId || null }),
      });
      const body = (await res.json()) as {
        error?: string;
        assignedDriverName?: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? "تعذر تعيين السائق");
      toast(driver ? `تم تعيين السائق ${driver.username}` : "تم إلغاء تعيين السائق", "success");
    } catch (err) {
      setRows(previous);
      toast(err instanceof Error ? err.message : "تعذر تعيين السائق", "error");
    } finally {
      setSavingId(null);
    }
  }

  if (visible.length === 0 && rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        لا توجد طلبات بعد
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((item) => {
          const count = item.statuses.length
            ? rows.filter((order) => item.statuses.includes(displayStatus(order.status))).length
            : rows.length;
          return (
            <button
              key={item.id || "all"}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                statusFilter === item.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-gray-100"
              }`}
            >
              {item.label} ({count})
            </button>
          );
        })}
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="بحث برقم الطلب أو الهاتف أو الاسم"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">رقم الطلب</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">العنوان / ملاحظات</th>
              <th className="px-4 py-3">الأصناف</th>
              <th className="px-4 py-3">الإجمالي</th>
              <th className="px-4 py-3">السائق</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {visible.map((order) => (
              <tr key={order.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900 dark:text-gray-100" dir="ltr">
                  {displayOrderNumber(order)}
                  <button
                    type="button"
                    onClick={() => setDetail(order)}
                    className="mt-1 block text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    👁️ التفاصيل
                  </button>
                </td>
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
                  {formatDelivery(order) && (
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-gray-200">
                      {formatDelivery(order)}
                    </p>
                  )}
                  {order.notes && !/^deliveryTime:/i.test(order.notes.trim()) && (
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
                  <select
                    value={order.assignedDriverId ?? ""}
                    disabled={savingId === order.id}
                    onChange={(event) => {
                      void assignDriver(order.id, event.target.value);
                    }}
                    className="max-w-[10rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="">بدون سائق</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.username}
                      </option>
                    ))}
                  </select>
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
      {detail && (
        <OrderDetailsModal order={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100" dir="ltr">
              {displayOrderNumber(order)}
            </h2>
            <p className="text-sm text-slate-500 dark:text-gray-300">
              {order.customerName} · {formatOrderDate(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-slate-800"
          >
            إغلاق
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm text-slate-800 dark:text-gray-100">
          <p>
            <span className="text-slate-500 dark:text-gray-400">الهاتف: </span>
            <span dir="ltr">{order.phone}</span>
          </p>
          <p>
            <span className="text-slate-500 dark:text-gray-400">العنوان: </span>
            {order.address}
          </p>
          {formatDelivery(order) && <p>{formatDelivery(order)}</p>}
          {order.notes && !/^deliveryTime:/i.test(order.notes.trim()) && (
            <p>
              <span className="text-slate-500 dark:text-gray-400">ملاحظات العميل: </span>
              {order.notes}
            </p>
          )}
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <SafeImage
                  src={item.imageUrl}
                  alt={item.productName}
                  className="h-12 w-12 rounded-lg bg-slate-100 object-cover dark:bg-slate-800"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    {item.isWeighed ? "وزن" : "عبوة"}
                    {item.packSize && item.packSize > 1 ? ` · ${item.packSize} قطعة` : ""} · الكمية{" "}
                    {item.quantity}
                    {item.price != null ? ` · ${formatEGP(item.price)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800 sm:grid-cols-2">
            <p>الكوبون: {order.couponCode || "—"} {order.couponDiscount ? `(${formatEGP(order.couponDiscount)})` : ""}</p>
            <p>النقاط المستبدلة: {(order.pointsRedeemed ?? 0).toLocaleString("ar-EG")} {order.pointsDiscount ? `(${formatEGP(order.pointsDiscount)})` : ""}</p>
            <p>رسوم التوصيل: {formatEGP(order.shippingFee ?? 0)}</p>
            <p className="font-bold">الإجمالي: {formatEGP(order.totalAmount)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrdersTable({
  orders,
  drivers = [],
}: {
  orders: OrderRow[];
  drivers?: DriverOption[];
}) {
  return (
    <ToastProvider>
      <OrdersTableInner orders={orders} drivers={drivers} />
    </ToastProvider>
  );
}
