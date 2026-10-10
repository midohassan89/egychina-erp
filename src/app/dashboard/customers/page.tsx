"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  pointsBalance: number;
  ordersCount: number;
  createdAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers");
      const body = (await res.json()) as {
        error?: string;
        customers?: CustomerRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load customers");
      setCustomers(body.customers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">العملاء ونقاط الولاء</h1>
        <p className="mt-1 text-slate-500">
          سجل عملاء المتجر ورصيد النقاط وعدد الطلبات
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-500">جاري التحميل…</p>
        ) : customers.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400">لا يوجد عملاء بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">المعرّف</th>
                  <th className="px-4 py-3 text-right font-semibold">الاسم</th>
                  <th className="px-4 py-3 text-right font-semibold">الهاتف</th>
                  <th className="px-4 py-3 text-right font-semibold">رصيد النقاط</th>
                  <th className="px-4 py-3 text-right font-semibold">عدد الطلبات</th>
                  <th className="px-4 py-3 text-right font-semibold">تاريخ التسجيل</th>
                  <th className="px-4 py-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/80">
                    <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-slate-500">
                      {customer.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {customer.name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {customer.phone}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">
                      {customer.pointsBalance.toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {customer.ordersCount.toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(customer.createdAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditing(customer)}
                        className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        تعديل النقاط
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <EditPointsModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setCustomers((prev) =>
              prev.map((row) => (row.id === updated.id ? updated : row)),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditPointsModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow;
  onClose: () => void;
  onSaved: (customer: CustomerRow) => void;
}) {
  const [points, setPoints] = useState(String(customer.pointsBalance));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = Number(points);
    if (!Number.isInteger(next) || next < 0) {
      setError("أدخل عدداً صحيحاً أكبر من أو يساوي صفر");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}/points`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointsBalance: next,
          note: note.trim() || null,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        customer?: CustomerRow;
      };
      if (!res.ok || !body.customer) {
        throw new Error(body.error ?? "Could not update points");
      }
      onSaved(body.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update points");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">تعديل النقاط</h2>
            <p className="text-sm text-slate-500">
              {customer.name?.trim() || customer.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              رصيد النقاط
            </span>
            <input
              type="number"
              min={0}
              step={1}
              required
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              ملاحظة (اختياري)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
            >
              {saving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
