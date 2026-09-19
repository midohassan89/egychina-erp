"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CartLine, LineDiscountType } from "@/types/pos";
import { computeLineTotal } from "@/types/pos";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import { clsx } from "clsx";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

interface CartEditModalProps {
  line: CartLine;
  open: boolean;
  onClose: () => void;
  onSave: (patch: {
    qty: number;
    unitPrice: number;
    discountType: LineDiscountType | null;
    discountValue: number;
  }) => void;
}

export function CartEditModal({
  line,
  open,
  onClose,
  onSave,
}: CartEditModalProps) {
  const kb = usePosKeyboardOptional();
  const isScale = line.isScalePriced || line.isWeighted;
  const [qty, setQty] = useState(String(line.qty));
  const [unitPrice, setUnitPrice] = useState(String(line.unitPrice));
  const [discountType, setDiscountType] = useState<LineDiscountType | "none">(
    line.discountType ?? "none",
  );
  const [discountValue, setDiscountValue] = useState(
    String(line.discountValue ?? ""),
  );

  useEffect(() => {
    if (!open) return;
    setQty(String(line.qty));
    setUnitPrice(String(line.unitPrice));
    setDiscountType(line.discountType ?? "none");
    setDiscountValue(
      line.discountValue && line.discountValue > 0
        ? String(line.discountValue)
        : "",
    );
  }, [open, line]);

  useEffect(() => {
    if (!open) kb?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const preview = useMemo(() => {
    const q = isScale ? 1 : Math.max(1, Math.floor(parseFloat(qty) || 1));
    const price = Math.max(0, parseFloat(unitPrice) || 0);
    const disc =
      discountType === "none" ? 0 : Math.max(0, parseFloat(discountValue) || 0);
    const type = discountType === "none" ? null : discountType;
    return computeLineTotal(q, price, type, disc);
  }, [qty, unitPrice, discountType, discountValue, isScale]);

  if (!open) return null;

  function handleClose() {
    kb?.close();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3">
      <div className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              Edit Item
            </h2>
            <p className="truncate text-sm text-slate-500">{line.product.name}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <PosKeyboardScrollArea className="flex-1 space-y-4 px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Quantity</span>
            <PosKeyboardInput
              inputName="cart-qty"
              mode="numpad"
              type="text"
              inputMode="none"
              disabled={isScale}
              value={isScale ? "1" : qty}
              onChange={setQty}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
            />
            {isScale && (
              <span className="text-xs text-amber-700">
                Scale items stay at qty 1
              </span>
            )}
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Unit price (EGP)
            </span>
            <PosKeyboardInput
              inputName="cart-price"
              mode="numpad"
              type="text"
              inputMode="none"
              value={unitPrice}
              onChange={setUnitPrice}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Discount</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["none", "None"],
                  ["percent", "%"],
                  ["flat", "EGP"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDiscountType(id)}
                  className={clsx(
                    "rounded-xl border py-2.5 text-sm font-semibold",
                    discountType === id
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {discountType !== "none" && (
              <PosKeyboardInput
                inputName="cart-discount"
                mode="numpad"
                type="text"
                inputMode="none"
                value={discountValue}
                onChange={setDiscountValue}
                placeholder={
                  discountType === "percent"
                    ? "Percent (e.g. 10)"
                    : "Amount EGP"
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
            <span className="text-sm text-slate-300">Line total</span>
            <span className="text-2xl font-bold tabular-nums">
              {formatEGP(preview)}
            </span>
          </div>
        </PosKeyboardScrollArea>

        <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const q = isScale
                ? 1
                : Math.max(1, Math.floor(parseFloat(qty) || 1));
              const price = roundMoney(Math.max(0, parseFloat(unitPrice) || 0));
              const disc =
                discountType === "none"
                  ? 0
                  : Math.max(0, parseFloat(discountValue) || 0);
              onSave({
                qty: q,
                unitPrice: price,
                discountType: discountType === "none" ? null : discountType,
                discountValue: disc,
              });
              handleClose();
            }}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
