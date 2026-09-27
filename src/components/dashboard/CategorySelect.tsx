"use client";

import { useEffect, useState } from "react";

interface CategoryOption {
  id: string;
  name: string;
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

  useEffect(() => {
    let cancelled = false;
    void loadCategories().then((list) => {
      if (!cancelled) setCategories(list);
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
      <option value="">اختر القسم...</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  );
}
