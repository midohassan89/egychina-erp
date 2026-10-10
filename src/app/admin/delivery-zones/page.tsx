"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface DeliveryZoneRow {
  id: string;
  nameAr: string;
  nameEn: string;
  nameZh: string;
  deliveryFee: number;
  isActive: boolean;
}

const emptyForm = {
  nameAr: "",
  nameEn: "",
  nameZh: "",
  deliveryFee: "",
  isActive: true,
};

export default function DeliveryZonesPage() {
  const [zones, setZones] = useState<DeliveryZoneRow[]>([]);
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
      const res = await fetch("/api/delivery-zones", { cache: "no-store" });
      const body = (await res.json()) as {
        zones?: DeliveryZoneRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not load zones");
      setZones(body.zones ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load zones");
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

  function openEdit(zone: DeliveryZoneRow) {
    setEditingId(zone.id);
    setForm({
      nameAr: zone.nameAr,
      nameEn: zone.nameEn ?? "",
      nameZh: zone.nameZh ?? "",
      deliveryFee: String(zone.deliveryFee),
      isActive: zone.isActive,
    });
    setError(null);
    setModalOpen(true);
  }

  async function saveZone(event: FormEvent) {
    event.preventDefault();
    const deliveryFee = Number(form.deliveryFee);
    if (!form.nameAr.trim()) {
      setError("اسم المنطقة بالعربية مطلوب");
      return;
    }
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      setError("رسوم التوصيل يجب أن تكون 0 أو أكثر");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery-zones", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          nameAr: form.nameAr.trim(),
          nameEn: form.nameEn.trim(),
          nameZh: form.nameZh.trim(),
          deliveryFee,
          isActive: form.isActive,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save zone");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save zone");
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(zone: DeliveryZoneRow) {
    if (!window.confirm(`حذف منطقة «${zone.nameAr}»؟`)) return;
    setError(null);
    try {
      const res = await fetch("/api/delivery-zones", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zone.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not delete zone");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete zone");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مناطق التوصيل</h1>
          <p className="mt-1 text-slate-500">
            أسماء مناطق التوصيل ورسوم كل منطقة
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          إضافة منطقة
        </button>
      </div>

      {error && !modalOpen && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-right">الاسم (عربي)</th>
              <th className="px-4 py-3 text-right">English</th>
              <th className="px-4 py-3 text-right">中文</th>
              <th className="px-4 py-3 text-right">رسوم التوصيل</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  جاري التحميل…
                </td>
              </tr>
            ) : zones.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  لا توجد مناطق توصيل بعد.
                </td>
              </tr>
            ) : (
              zones.map((zone) => (
                <tr key={zone.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {zone.nameAr}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{zone.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{zone.nameZh || "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {formatEGP(zone.deliveryFee)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        zone.isActive
                          ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                          : "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
                      }
                    >
                      {zone.isActive ? "نشطة" : "متوقفة"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(zone)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteZone(zone)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
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
            onSubmit={(event) => void saveZone(event)}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? "تعديل المنطقة" : "منطقة جديدة"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                اسم المنطقة (عربي)
              </span>
              <input
                required
                value={form.nameAr}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameAr: e.target.value }))
                }
                placeholder="مثال: تيدا الصناعية"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Zone Name (English)
              </span>
              <input
                value={form.nameEn}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameEn: e.target.value }))
                }
                placeholder="e.g. TEDA Industrial"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Zone Name (Chinese)
              </span>
              <input
                value={form.nameZh}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameZh: e.target.value }))
                }
                placeholder="例如：泰达工业区"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                رسوم التوصيل (ج.م)
              </span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.deliveryFee}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, deliveryFee: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              المنطقة نشطة وتظهر في المتجر
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
          </form>
        </div>
      )}
    </div>
  );
}
