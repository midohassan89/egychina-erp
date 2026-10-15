"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { QuickNameDialog, translateArabicName } from "@/components/dashboard/QuickNameDialog";
import { useToast } from "@/components/ui/Toast";

interface CategoryOption {
  id: string;
  name: string;
}

function slugFromEnglish(english: string): string {
  const slug = english
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `cat-${Date.now().toString(36)}`;
}

async function loadCategories(): Promise<CategoryOption[]> {
  const endpoints = ["/api/categories", "/api/store/categories"];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as
        | CategoryOption[]
        | { categories?: CategoryOption[] };
      const list = Array.isArray(data) ? data : (data.categories ?? []);
      return list
        .filter((cat) => cat && cat.id)
        .map((cat) => ({ id: String(cat.id), name: String(cat.name ?? "") }));
    } catch {
      // Try the next endpoint.
    }
  }
  return [];
}

export function CategorySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (categoryId: string) => void;
  className?: string;
}) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void loadCategories().then((list) => {
      if (!cancelled) {
        setCategories(list);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectExistingCategory(newName: string): boolean {
    const existingItem = categories.find(
      (category) => category.name.trim() === newName.trim(),
    );
    if (!existingItem) return false;
    onChange(existingItem.id);
    toast("هذا العنصر موجود بالفعل، تم اختياره تلقائياً", "info");
    return true;
  }

  async function createCategory(name: string): Promise<string | null> {
    const translated = await translateArabicName(name);
    if (!translated) return "تعذر ترجمة الاسم قبل الحفظ";

    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        nameEn: translated.en,
        nameZh: translated.zh,
        slug: slugFromEnglish(translated.en),
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      category?: { id?: string; name?: string };
    };
    if (!res.ok || !data.category?.id) {
      if (res.status === 409) return "هذا الاسم موجود بالفعل";
      return data.error || "تعذر حفظ التصنيف";
    }

    const created = {
      id: String(data.category.id),
      name: String(data.category.name || name),
    };
    setCategories((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    );
    onChange(created.id);
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={
            className ??
            "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          }
        >
          <option value="">
            {loaded && categories.length === 0
              ? "لا توجد تصنيفات"
              : "اختر التصنيف..."}
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="إضافة تصنيف"
          aria-label="إضافة تصنيف"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        >
          <Plus size={18} />
        </button>
      </div>
      <QuickNameDialog
        open={creating}
        title="تصنيف جديد"
        onClose={() => setCreating(false)}
        onSave={createCategory}
        matchesExisting={selectExistingCategory}
      />
    </>
  );
}
