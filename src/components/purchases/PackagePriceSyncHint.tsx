"use client";

import { TriangleAlert } from "lucide-react";

export function samePriceInput(current: string, initial: string): boolean {
  const next = current.trim();
  const previous = initial.trim();
  if (next === previous) return true;
  if (!next || !previous) return false;
  const nextAmount = Number(next);
  const previousAmount = Number(previous);
  return (
    Number.isFinite(nextAmount) &&
    Number.isFinite(previousAmount) &&
    Math.round(nextAmount * 100) === Math.round(previousAmount * 100)
  );
}

export function hasCustomPackagePrice(
  packages: { price: number | null }[] | null | undefined,
): boolean {
  return (packages ?? []).some((row) => row != null && row.price != null);
}

export function sellingPricesDiffer(line: {
  regularPrice: string;
  salePrice: string;
  originalRegularPrice: string;
  originalSalePrice: string;
}): boolean {
  return (
    !samePriceInput(line.regularPrice, line.originalRegularPrice) ||
    !samePriceInput(line.salePrice, line.originalSalePrice)
  );
}

export function PackagePriceSyncHint({
  visible,
  checked,
  disabled,
  onCheckedChange,
}: {
  visible: boolean;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  if (!visible) return null;

  return (
    <div className="mt-1 max-w-[11.5rem]">
      <p className="text-xs leading-snug text-amber-600">
        <TriangleAlert
          size={14}
          className="me-1 inline text-amber-500"
          aria-hidden
        />
        تنبيه: للمنتج أسعار عبوات مخصصة قديمة.
      </p>
      <label className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-800">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600"
        />
        تصفير أسعار العبوات؟
      </label>
    </div>
  );
}
