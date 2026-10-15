"use client";

import { useEffect, useState } from "react";

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

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
  );
}
