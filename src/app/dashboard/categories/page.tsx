"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

interface CategoryRow {
  id: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  slug: string;
  description: string | null;
  productCount: number;
}

export default function CategoriesPage() {
  return (
    <ToastProvider>
      <CategoriesManagement />
    </ToastProvider>
  );
}

function CategoriesManagement() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [slug, setSlug] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const body = (await res.json()) as {
        categories?: CategoryRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not load categories");
      setCategories(body.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName("");
    setNameEn("");
    setNameZh("");
    setSlug("");
    setEditingId(null);
  }

  function startEdit(category: CategoryRow) {
    setEditingId(category.id);
    setName(category.name);
    setNameEn(category.nameEn ?? "");
    setNameZh(category.nameZh ?? "");
    setSlug(category.slug);
    setError(null);
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name, nameEn, nameZh, slug };
      const res = await fetch(
        editingId ? `/api/categories/${editingId}` : "/api/categories",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save category");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: CategoryRow) {
    if (category.productCount > 0 || deletingId) return;
    if (!window.confirm("هل أنت متأكد من حذف هذا القسم؟")) return;

    setDeletingId(category.id);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not delete category");
      if (editingId === category.id) resetForm();
      toast("تم حذف القسم", "success");
      await load();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete category";
      setError(message);
      toast(message, "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">الأقسام</h1>
        <p className="mt-1 text-slate-500 dark:text-gray-400">أقسام المنتجات المستخدمة في الكتالوج</p>
      </div>

      <form
        onSubmit={(event) => void saveCategory(event)}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">الاسم</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مكرونات"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">Slug</span>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="pastas"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
            الاسم (English)
          </span>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Pasta"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
            الاسم (中文)
          </span>
          <input
            value={nameZh}
            onChange={(e) => setNameZh(e.target.value)}
            placeholder="意大利面"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingId ? "حفظ" : "إضافة جديد"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              إلغاء
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3">English</th>
              <th className="px-4 py-3">中文</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3 text-left">المنتجات</th>
              <th className="px-4 py-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  جاري التحميل…
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  لا توجد أقسام بعد.
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-gray-100">{category.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{category.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{category.nameZh || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-gray-300">{category.slug}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-gray-200">
                    {category.productCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(category)}
                        className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
                      >
                        تعديل
                      </button>
                      <span
                        title={
                          category.productCount > 0
                            ? "لا يمكن حذف قسم يحتوي على منتجات"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          disabled={
                            category.productCount > 0 ||
                            deletingId === category.id
                          }
                          onClick={() => void deleteCategory(category)}
                          className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-red-300"
                        >
                          {deletingId === category.id ? "جاري الحذف…" : "حذف"}
                        </button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
