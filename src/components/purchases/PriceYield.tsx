/** Active retail price: discounted price when set, otherwise the regular price. */
function activeSellPrice(regularPrice: string, salePrice: string): number {
  const regular = Number(regularPrice);
  const saleRaw = salePrice.trim();
  const sale = saleRaw === "" ? NaN : Number(saleRaw);
  return Number.isFinite(sale) && sale > 0 ? sale : regular;
}

/**
 * Markup is profit divided by cost. Margin is profit divided by the sell price.
 * Returns null when there is no positive sell price to compare.
 */
export function priceYield(
  cost: number,
  regularPrice: string,
  salePrice: string,
): { marginPercent: number; markupPercent: number } | null {
  const sellPrice = activeSellPrice(regularPrice, salePrice);
  if (!Number.isFinite(sellPrice) || sellPrice <= 0 || !Number.isFinite(cost)) {
    return null;
  }
  const profit = sellPrice - cost;
  return {
    markupPercent: cost > 0 ? (profit / cost) * 100 : 0,
    marginPercent: (profit / sellPrice) * 100,
  };
}

export function PriceYieldBadges({
  cost,
  regularPrice,
  salePrice,
}: {
  cost: number;
  regularPrice: string;
  salePrice: string;
}) {
  const yieldPct = priceYield(cost, regularPrice, salePrice);
  if (!yieldPct) {
    return (
      <span className="block text-center text-sm font-bold text-slate-300 dark:text-gray-600">—%</span>
    );
  }
  const { marginPercent, markupPercent } = yieldPct;
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-[10px] sm:text-xs">
      <span
        className={
          marginPercent < 0
            ? "w-full whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-center font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : "w-full whitespace-nowrap rounded bg-emerald-50 px-1.5 py-0.5 text-center font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        }
        title="هامش الربح من إجمالي البيع (Profit Margin)"
      >
        {marginPercent.toFixed(1)}% ربح
      </span>
      <span
        className={
          markupPercent < 0
            ? "w-full whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-center font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : "w-full whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-center font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
        }
        title="نسبة الإضافة على التكلفة (Markup)"
      >
        {markupPercent.toFixed(1)}% إضافة
      </span>
    </div>
  );
}
