"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CachedProduct } from "@/types/woocommerce";
import {
  computeLineTotal,
  type CartLine,
  type LineDiscountType,
} from "@/types/pos";
import { roundMoney, roundQty, getCatalogSellingPrice } from "@/lib/pos/money";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { posItemKey } from "@/lib/pos/posItemKey";

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withTotals(
  line: CartLine,
  patch: Partial<
    Pick<CartLine, "qty" | "unitPrice" | "discountType" | "discountValue">
  >,
): CartLine {
  const qty = patch.qty ?? line.qty;
  const unitPrice = patch.unitPrice ?? line.unitPrice;
  const discountType =
    patch.discountType !== undefined ? patch.discountType : line.discountType;
  const discountValue =
    patch.discountValue !== undefined
      ? patch.discountValue
      : line.discountValue;
  return {
    ...line,
    ...patch,
    qty,
    unitPrice,
    discountType,
    discountValue,
    lineTotal: computeLineTotal(qty, unitPrice, discountType, discountValue),
  };
}

function sameMergeKey(
  line: CartLine,
  product: CachedProduct,
  unitPrice: number,
): boolean {
  return (
    !line.isScalePriced &&
    posItemKey(line.product) === posItemKey(product) &&
    !line.discountType &&
    line.unitPrice === unitPrice
  );
}

/** Result of adding to the cart — used for highlight + smart scroll. */
export interface CartAddResult {
  productId: number;
  lineId: string;
  isNew: boolean;
}

export function useCart(returnMode = false) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const addProduct = useCallback(
    (product: CachedProduct, qty = 1): CartAddResult => {
      const catalogPrice = getCatalogSellingPrice(product);
      const absQty = Math.max(1, Math.floor(Math.abs(qty)));
      const signedQty = returnMode ? -absQty : absQty;
      const unitPrice = returnMode ? -catalogPrice : catalogPrice;

      const existing = linesRef.current.find((line) =>
        sameMergeKey(line, product, unitPrice),
      );

      if (existing) {
        setLines((prev) =>
          prev.map((line) => {
            if (line.lineId !== existing.lineId) return line;
            const nextQty = returnMode
              ? line.qty - absQty
              : line.qty + absQty;
            return withTotals(line, { qty: nextQty });
          }),
        );
        return {
          productId: product.id,
          lineId: existing.lineId,
          isNew: false,
        };
      }

      const lineId = newLineId();
      setLines((prev) => [
        ...prev,
        {
          lineId,
          product,
          qty: signedQty,
          unitPrice,
          lineTotal: computeLineTotal(signedQty, unitPrice),
          isScalePriced: false,
          isWeighted: false,
          barcode: product.isPackage
            ? getOpBarcodes(product)[0]
            : undefined,
          discountType: null,
          discountValue: 0,
        },
      ]);

      return {
        productId: product.id,
        lineId,
        isNew: true,
      };
    },
    [returnMode],
  );

  const addScaleLine = useCallback(
    (input: {
      product: CachedProduct;
      customTotal: number;
      qty?: number;
      unitPrice?: number;
      barcode?: string;
      plu?: string;
    }): CartAddResult => {
      const absTotal = roundMoney(Math.abs(input.customTotal));
      const customTotal = returnMode ? -absTotal : absTotal;
      const absQty =
        input.qty != null && Number.isFinite(input.qty) && Math.abs(input.qty) > 0
          ? roundQty(Math.abs(input.qty))
          : 1;
      const signedQty = returnMode ? -absQty : absQty;
      const absUnit =
        input.unitPrice != null && input.unitPrice > 0
          ? Math.abs(input.unitPrice)
          : absTotal;
      const signedUnit = returnMode ? -absUnit : absUnit;
      const lineId = newLineId();

      setLines((prev) => [
        ...prev,
        {
          lineId,
          product: input.product,
          qty: signedQty,
          unitPrice: signedUnit,
          lineTotal: customTotal,
          isScalePriced: true,
          isWeighted: true,
          weightKg: absQty,
          barcode: input.barcode,
          plu: input.plu,
          discountType: null,
          discountValue: 0,
        },
      ]);

      return {
        productId: input.product.id,
        lineId,
        isNew: true,
      };
    },
    [returnMode],
  );

  const addWeightedLine = useCallback(
    (input: Omit<CartLine, "lineId">) => {
      const absTotal = roundMoney(Math.abs(input.lineTotal));
      const customTotal = returnMode ? -absTotal : absTotal;
      setLines((prev) => [
        ...prev,
        {
          ...input,
          lineId: newLineId(),
          qty: returnMode ? -1 : 1,
          unitPrice: customTotal,
          lineTotal: customTotal,
          isScalePriced: true,
          isWeighted: true,
        },
      ]);
    },
    [returnMode],
  );

  const increment = useCallback(
    (lineId: string) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.lineId !== lineId || line.isScalePriced) return line;
          if (returnMode || line.qty < 0) {
            return withTotals(line, { qty: line.qty - 1 });
          }
          return withTotals(line, { qty: line.qty + 1 });
        }),
      );
    },
    [returnMode],
  );

  const decrement = useCallback(
    (lineId: string) => {
      setLines((prev) =>
        prev.flatMap((line) => {
          if (line.lineId !== lineId) return [line];
          if (line.isScalePriced) return [line];
          if (returnMode || line.qty < 0) {
            const next = line.qty + 1;
            if (next >= 0) return [];
            return [withTotals(line, { qty: next })];
          }
          if (line.qty <= 1) return [];
          return [withTotals(line, { qty: line.qty - 1 })];
        }),
      );
    },
    [returnMode],
  );

  const updateLine = useCallback(
    (
      lineId: string,
      patch: {
        qty?: number;
        unitPrice?: number;
        discountType?: LineDiscountType | null;
        discountValue?: number;
      },
    ) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.lineId !== lineId) return line;

          const isReturnLine = returnMode || line.qty < 0 || line.unitPrice < 0;
          let nextQty = line.qty;
          if (patch.qty !== undefined) {
            if (line.isScalePriced) {
              const abs = roundQty(Math.abs(line.qty)) || 1;
              nextQty = isReturnLine ? -abs : abs;
            } else {
              const abs = Math.max(1, Math.floor(Math.abs(patch.qty)));
              nextQty = isReturnLine ? -abs : abs;
            }
          }

          let nextPrice = patch.unitPrice ?? line.unitPrice;
          if (patch.unitPrice !== undefined && isReturnLine) {
            nextPrice = -Math.abs(patch.unitPrice);
          } else if (patch.unitPrice !== undefined) {
            nextPrice = Math.abs(patch.unitPrice);
          }

          const next = withTotals(line, {
            ...patch,
            qty: nextQty,
            unitPrice: nextPrice,
          });
          const priceUnchanged =
            Math.abs(Math.abs(nextPrice) - Math.abs(line.unitPrice)) < 0.001;
          if (line.isScalePriced && priceUnchanged && !next.discountType) {
            const sign = line.lineTotal < 0 ? -1 : 1;
            return { ...next, lineTotal: sign * Math.abs(line.lineTotal) };
          }
          return next;
        }),
      );
    },
    [returnMode],
  );

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  /** Replace the entire cart (used when recalling a held invoice). */
  const replaceLines = useCallback((next: CartLine[]) => {
    setLines(Array.isArray(next) ? next : []);
  }, []);

  const itemCount = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum + (line.isScalePriced ? 1 : Math.abs(line.qty)),
        0,
      ),
    [lines],
  );

  const total = useMemo(
    () => roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
    [lines],
  );

  return {
    lines,
    itemCount,
    total,
    addProduct,
    addScaleLine,
    addWeightedLine,
    increment,
    decrement,
    updateLine,
    removeLine,
    clear,
    replaceLines,
  };
}
