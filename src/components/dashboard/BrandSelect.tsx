"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { QuickNameDialog, translateArabicName } from "@/components/dashboard/QuickNameDialog";
import { useToast } from "@/components/ui/Toast";

interface BrandOption {
  id: string;
  name: string;
}

export function BrandSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (brandId: string) => void;
  className?: string;
}) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/brands", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = (await res.json()) as { brands?: BrandOption[] };
        return (data.brands ?? [])
          .filter((brand) => brand && brand.id)
          .map((brand) => ({
            id: String(brand.id),
            name: String(brand.name ?? ""),
          }));
      })
      .then((list) => {
        if (!cancelled) {
          setBrands(list);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrands([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectExistingBrand(newName: string): boolean {
    const existingItem = brands.find(
      (brand) => brand.name.trim() === newName.trim(),
    );
    if (!existingItem) return false;
    onChange(existingItem.id);
    toast("هذا العنصر موجود بالفعل، تم اختياره تلقائياً", "info");
    return true;
  }

  async function createBrand(name: string): Promise<string | null> {
    const translated = await translateArabicName(name);
    if (!translated) return "تعذر ترجمة الاسم قبل الحفظ";

    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        nameEn: translated.en,
        nameZh: translated.zh,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      brand?: { id?: string; name?: string };
    };
    if (!res.ok || !data.brand?.id) {
      if (res.status === 409) return "هذا الاسم موجود بالفعل";
      return data.error || "تعذر حفظ العلامة التجارية";
    }

    const created = {
      id: String(data.brand.id),
      name: String(data.brand.name || name),
    };
    setBrands((prev) =>
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
            "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
          }
        >
          <option value="">
            {loaded && brands.length === 0
              ? "لا توجد علامات تجارية"
              : "اختر العلامة التجارية..."}
          </option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="إضافة علامة تجارية"
          aria-label="إضافة علامة تجارية"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-brand-400"
        >
          <Plus size={18} />
        </button>
      </div>
      <QuickNameDialog
        open={creating}
        title="علامة تجارية جديدة"
        onClose={() => setCreating(false)}
        onSave={createBrand}
        matchesExisting={selectExistingBrand}
      />
    </>
  );
}
