"use client";

import { Wand2 } from "lucide-react";
import { clsx } from "clsx";

export const MARGIN_PRESETS = [20, 25, 30, 35] as const;

export const INVOICE_MARGINS = [10, 15, 20, 25, 30, 35] as const;

/** Discounted price is cost plus the margin, rounded up. Regular price is 5% above that, also rounded up. */
export function pricesFromMargin(
  cost: number,
  marginPercent: number,
): { regular: number; discounted: number } | null {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(marginPercent) || marginPercent < 0) return null;
  const discounted = Math.ceil(cost * (1 + marginPercent / 100));
  const regular = Math.ceil(discounted * 1.05);
  if (regular <= 0) return null;
  return { regular, discounted };
}

export function MarginPills({
  cost,
  disabled,
  compact,
  onSelect,
}: {
  cost: number;
  disabled?: boolean;
  compact?: boolean;
  onSelect: (marginPercent: number) => void;
}) {
  const ready = Number.isFinite(cost) && cost > 0;

  return (
    <div className={compact ? "mt-1 flex flex-wrap gap-1" : "flex flex-wrap gap-1.5"}>
      {MARGIN_PRESETS.map((margin) => (
        <button
          key={margin}
          type="button"
          disabled={disabled || !ready}
          onClick={() => onSelect(margin)}
          className={
            compact
              ? "cursor-pointer rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200"
              : "cursor-pointer rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200"
          }
        >
          {margin}%
        </button>
      ))}
    </div>
  );
}

export function InvoiceMarginSelector({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (margin: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-gray-100">
        نسبة الربح الافتراضية للفاتورة
      </p>
      <div className="flex flex-wrap gap-1.5">
        {INVOICE_MARGINS.map((margin) => {
          const selected = value === margin;
          return (
            <button
              key={margin}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : margin)}
              className={clsx(
                "cursor-pointer rounded-full px-2.5 py-1 text-xs transition disabled:opacity-40",
                selected
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-emerald-100 dark:bg-slate-900 dark:text-gray-100 dark:hover:bg-slate-700",
              )}
            >
              {margin}%
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SuggestPriceButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="اقترح السعر"
      aria-label="اقترح السعر"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-300"
    >
      <Wand2 size={14} />
    </button>
  );
}
