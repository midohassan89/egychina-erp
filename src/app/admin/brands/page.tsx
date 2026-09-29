"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

interface BrandRow {
  id: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  image: string | null;
  productCount: number;
}

const emptyForm = {
  name: "",
  nameEn: "",
  nameZh: "",
  image: "",
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
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
      const res = await fetch("/api/admin/brands", { cache: "no-store" });
      const body = (await res.json()) as {
        brands?: BrandRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not load brands");
      setBrands(body.brands ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load brands");
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

  function openEdit(brand: BrandRow) {
    setEditingId(brand.id);
    setForm({
      name: brand.name,
      nameEn: brand.nameEn ?? "",
      nameZh: brand.nameZh ?? "",
      image: brand.image ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function saveBrand(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/admin/brands/${editingId}` : "/api/admin/brands",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save brand");
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save brand");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBrand(brand: BrandRow) {
    if (!window.confirm(`حذف العلامة "${brand.name}"؟`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not delete brand");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete brand");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">العلامات التجارية</h1>
          <p className="mt-1 text-slate-500">Brands used to group products</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          إضافة علامة
        </button>
      </div>

      {error && !modalOpen && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">الشعار</th>
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3">English</th>
              <th className="px-4 py-3">中文</th>
              <th className="px-4 py-3 text-right">المنتجات</th>
              <th className="px-4 py-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Loading brands…
                </td>
              </tr>
            ) : brands.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No brands yet.
                </td>
              </tr>
            ) : (
              brands.map((brand) => (
                <tr key={brand.id}>
                  <td className="px-4 py-3">
                    {brand.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={brand.image}
                        alt=""
                        className="h-10 w-10 rounded-lg object-contain"
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{brand.name}</td>
                  <td className="px-4 py-3 text-slate-600">{brand.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{brand.nameZh || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {brand.productCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(brand)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteBrand(brand)}
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
            onSubmit={(event) => void saveBrand(event)}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? "تعديل العلامة" : "علامة جديدة"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                الاسم (عربي)
              </span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Name (English)
              </span>
              <input
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                名称 (中文)
              </span>
              <input
                value={form.nameZh}
                onChange={(e) => setForm((f) => ({ ...f, nameZh: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Image URL
              </span>
              <input
                value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="https://… or /uploads/…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
