"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CachedProduct } from "@/types/woocommerce";
import {
  computeLineTotal,
  type CartLine,
  type LineDiscountType,
} from "@/types/pos";
import { roundMoney, getCatalogSellingPrice } from "@/lib/pos/money";

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
  productId: number,
  unitPrice: number,
): boolean {
  return (
    !line.isScalePriced &&
    line.product.id === productId &&
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
        sameMergeKey(line, product.id, unitPrice),
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
      barcode?: string;
      plu?: string;
    }): CartAddResult => {
      const absTotal = roundMoney(Math.abs(input.customTotal));
      const customTotal = returnMode ? -absTotal : absTotal;
      const lineId = newLineId();

      setLines((prev) => [
        ...prev,
        {
          lineId,
          product: input.product,
          qty: returnMode ? -1 : 1,
          unitPrice: customTotal,
          lineTotal: customTotal,
          isScalePriced: true,
          isWeighted: true,
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
              nextQty = isReturnLine ? -1 : 1;
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

          return withTotals(line, {
            ...patch,
            qty: nextQty,
            unitPrice: nextPrice,
          });
        }),
      );
    },
    [returnMode],
  );

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

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
  };
}
