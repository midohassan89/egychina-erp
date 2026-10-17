"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Ticket, Trash2, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface CouponRow {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrder: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

const emptyForm = {
  code: "",
  discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  discountValue: "",
  minOrder: "0",
  maxDiscount: "",
  usageLimit: "",
  expiresAt: "",
  isActive: true,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coupons", { cache: "no-store" });
      const body = (await res.json()) as { coupons?: CouponRow[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load coupons");
      setCoupons(body.coupons ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load coupons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(coupon: CouponRow) {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      minOrder: String(coupon.minOrder ?? 0),
      maxDiscount: coupon.maxDiscount == null ? "" : String(coupon.maxDiscount),
      usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
      expiresAt: toLocalInput(coupon.expiresAt),
      isActive: coupon.isActive,
    });
    setError(null);
    setModalOpen(true);
  }

  async function saveCoupon(event: FormEvent) {
    event.preventDefault();
    if (editingId) {
      setError("تعديل بيانات الكود غير متاح. يمكنك إيقافه أو حذفه ثم إنشاء كود جديد.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minOrder: Number(form.minOrder || 0),
          maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
          usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          isActive: form.isActive,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save coupon");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save coupon");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(coupon: CouponRow) {
    setError(null);
    try {
      const res = await fetch(`/api/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not update coupon");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update coupon");
    }
  }

  async function deleteCoupon(coupon: CouponRow) {
    if (!window.confirm(`حذف كود «${coupon.code}»؟`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not delete coupon");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete coupon");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">أكواد الخصم</h1>
          <p className="mt-1 text-slate-500 dark:text-gray-400">
            إنشاء وإيقاف وحذف أكواد الخصم للمتجر
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          كود جديد
        </button>
      </div>

      {error && !modalOpen && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-right">الكود</th>
              <th className="px-4 py-3 text-right">الخصم</th>
              <th className="px-4 py-3 text-right">الحد الأدنى</th>
              <th className="px-4 py-3 text-right">أقصى خصم</th>
              <th className="px-4 py-3 text-right">الاستخدام</th>
              <th className="px-4 py-3 text-right">الانتهاء</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  جاري التحميل…
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  لا توجد أكواد خصم بعد.
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-slate-50/80 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-gray-100">
                    <span className="inline-flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-slate-400 dark:text-gray-500" />
                      {coupon.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-gray-200">
                    {coupon.discountType === "PERCENTAGE"
                      ? `${coupon.discountValue}%`
                      : formatEGP(coupon.discountValue)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-gray-200">
                    {formatEGP(coupon.minOrder)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-gray-200">
                    {coupon.maxDiscount == null ? "—" : formatEGP(coupon.maxDiscount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-gray-200">
                    {coupon.usedCount}
                    {coupon.usageLimit == null ? "" : ` / ${coupon.usageLimit}`}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                    {coupon.expiresAt
                      ? new Date(coupon.expiresAt).toLocaleString("ar-EG")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleCoupon(coupon)}
                      className={
                        coupon.isActive
                          ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-gray-800 dark:text-gray-400"
                      }
                    >
                      {coupon.isActive ? "نشط" : "متوقف"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(coupon)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        عرض
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCoupon(coupon)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={(event) => void saveCoupon(event)}
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">
                {editingId ? "بيانات الكود" : "كود خصم جديد"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-gray-500 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">الكود</span>
              <input
                required
                value={form.code}
                disabled={Boolean(editingId)}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE10"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-800"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">نوع الخصم</span>
              <select
                value={form.discountType}
                disabled={Boolean(editingId)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    discountType: e.target.value === "FIXED" ? "FIXED" : "PERCENTAGE",
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="PERCENTAGE">نسبة مئوية</option>
                <option value="FIXED">مبلغ ثابت</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                  قيمة الخصم
                </span>
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={Boolean(editingId)}
                  value={form.discountValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                  الحد الأدنى للطلب
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={Boolean(editingId)}
                  value={form.minOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, minOrder: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                  أقصى خصم
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={Boolean(editingId)}
                  value={form.maxDiscount}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxDiscount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                  حد الاستخدام
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={Boolean(editingId)}
                  value={form.usageLimit}
                  onChange={(e) => setForm((prev) => ({ ...prev, usageLimit: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                تاريخ الانتهاء
              </span>
              <input
                type="datetime-local"
                disabled={Boolean(editingId)}
                value={form.expiresAt}
                onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
              <input
                type="checkbox"
                disabled={Boolean(editingId)}
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-gray-700"
              />
              الكود نشط
            </label>

            {error && modalOpen && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                إلغاء
              </button>
              {!editingId && (
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  {saving ? "جاري الحفظ…" : "حفظ"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
