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
  duplicateIds?: string[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [merging, setMerging] = useState(false);
  const duplicateCount = customers.reduce(
    (sum, customer) => sum + (customer.duplicateIds?.length ?? 0),
    0,
  );

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">العملاء ونقاط الولاء</h1>
          <p className="mt-1 text-slate-500 dark:text-gray-400">
            سجل عملاء المتجر ورصيد النقاط وعدد الطلبات. أرقام 01 و +20 تُعرض كعميل واحد.
          </p>
        </div>
        {duplicateCount > 0 && (
          <button
            type="button"
            disabled={merging}
            onClick={() => {
              setMerging(true);
              void fetch("/api/customers/merge-duplicates", { method: "POST" })
                .then(() => load())
                .finally(() => setMerging(false));
            }}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {merging ? "جاري الدمج…" : `دمج الأرقام المكررة (${duplicateCount})`}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-500 dark:text-gray-400">جاري التحميل…</p>
        ) : customers.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 dark:text-gray-500">لا يوجد عملاء بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
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
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/80 dark:hover:bg-gray-800/60">
                    <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-slate-500 dark:text-gray-400">
                      {customer.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                      {customer.name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-gray-200">
                      {customer.phone}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900 dark:text-gray-100">
                      {customer.pointsBalance.toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-gray-200">
                      {customer.ordersCount.toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-400">
                      {new Date(customer.createdAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditing(customer)}
                        className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:text-brand-400"
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
  const [mode, setMode] = useState<"add" | "deduct" | "set">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount);
  const valid =
    mode === "set"
      ? Number.isInteger(value) && value >= 0
      : Number.isInteger(value) && value > 0;
  const nextBalance = !valid
    ? null
    : mode === "add"
      ? customer.pointsBalance + value
      : mode === "deduct"
        ? Math.max(0, customer.pointsBalance - value)
        : value;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("أدخل عدداً صحيحاً صالحاً");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if ((customer.duplicateIds?.length ?? 0) > 0) {
        const merged = await fetch("/api/customers/merge-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [customer.id, ...(customer.duplicateIds ?? [])] }),
        });
        if (!merged.ok) throw new Error("تعذر دمج الأرقام المكررة قبل تعديل النقاط");
      }
      const res = await fetch(`/api/customers/${customer.id}/points`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          amount: value,
          pointsBalance: mode === "set" ? value : undefined,
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
      onSaved({ ...body.customer, duplicateIds: [] });
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
        className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">تعديل النقاط</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {customer.name?.trim() || customer.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["add", "➕ إضافة نقاط"],
                ["deduct", "➖ خصم نقاط"],
                ["set", "🎯 تعيين الرصيد مباشرة"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                  mode === id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-gray-100">
            الرصيد قبل التعديل: {customer.pointsBalance.toLocaleString("ar-EG")}
            {nextBalance != null
              ? ` · بعد التعديل: ${nextBalance.toLocaleString("ar-EG")}`
              : ""}
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
              {mode === "set" ? "الرصيد الجديد" : "عدد النقاط"}
            </span>
            <input
              type="number"
              min={0}
              step={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
              ملاحظة (اختياري)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
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
