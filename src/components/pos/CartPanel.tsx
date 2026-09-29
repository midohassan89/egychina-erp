"use client";

import { useState, type RefObject } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Minus, Plus, Trash2, Pause, Clock } from "lucide-react";
import type { CartLine, LineDiscountType } from "@/types/pos";
import { formatEGP } from "@/lib/pos/money";
import { CartEditModal } from "@/components/pos/CartEditModal";

export function cartItemDomId(productId: number): string {
  return `cart-item-${productId}`;
}

interface CartPanelProps {
  lines: CartLine[];
  total: number;
  itemCount: number;
  returnMode?: boolean;
  /** Product id of the row currently flashing after a scan/add. */
  highlightedItemId?: number | null;
  /** Ref for the scrollable cart list (smart auto-scroll). */
  listRef?: RefObject<HTMLDivElement | null>;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  /** Return focus to barcode search after +/- so scans do not hit qty. */
  onAfterQtyChange?: () => void;
  onRemove: (lineId: string) => void;
  onUpdateLine: (
    lineId: string,
    patch: {
      qty?: number;
      unitPrice?: number;
      discountType?: LineDiscountType | null;
      discountValue?: number;
    },
  ) => void;
  onClear: () => void;
  onCheckout: () => void;
  isCheckingOut?: boolean;
  /** Hold current cart and clear for the next customer. */
  onHoldCart?: () => void;
  /** Open list of suspended invoices. */
  onOpenHeldCarts?: () => void;
  heldCartCount?: number;
  loyaltyCustomer?: {
    id: string;
    name: string | null;
    phone: string;
    pointsBalance: number;
  } | null;
  onClearLoyaltyCustomer?: () => void;
  redeemPoints?: boolean;
  onToggleRedeem?: (redeem: boolean) => void;
  pointsDiscount?: number;
}

export function CartPanel({
  lines,
  total,
  itemCount,
  returnMode = false,
  highlightedItemId = null,
  listRef,
  onIncrement,
  onDecrement,
  onAfterQtyChange,
  onRemove,
  onUpdateLine,
  onClear,
  onCheckout,
  isCheckingOut = false,
  onHoldCart,
  onOpenHeldCarts,
  heldCartCount = 0,
  loyaltyCustomer = null,
  onClearLoyaltyCustomer,
  redeemPoints = false,
  onToggleRedeem,
  pointsDiscount = 0,
}: CartPanelProps) {
  const [editLine, setEditLine] = useState<CartLine | null>(null);

  return (
    <section
      className={clsx(
        "flex h-[42vh] min-h-0 w-full shrink-0 flex-col border-b md:h-full md:w-[26rem] md:border-b-0 md:border-e lg:w-[30rem]",
        returnMode
          ? "border-red-300 bg-red-50/90"
          : "border-slate-200 bg-white",
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-between border-b px-4 py-3",
          returnMode ? "border-red-200 bg-red-100/80" : "border-slate-200",
        )}
      >
        <div>
          <h2
            className={clsx(
              "text-lg font-semibold",
              returnMode ? "text-red-900" : "text-slate-900",
            )}
          >
            {returnMode ? "وضع الاسترجاع" : "الطلب الحالي"}
          </h2>
          <p
            className={clsx(
              "text-xs",
              returnMode ? "text-red-700/80" : "text-slate-500",
            )}
          >
            {returnMode
              ? `${itemCount} أصناف مرتجعة · المبالغ سالبة`
              : `${itemCount} أصناف - اضغط للتعديل`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {onOpenHeldCarts && (
            <button
              type="button"
              onClick={onOpenHeldCarts}
              title="الفواتير المعلقة"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                الفواتير المعلقة ({heldCartCount})
              </span>
            </button>
          )}
          <Link
            href="/"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-white/70 hover:text-slate-800"
          >
            خروج
          </Link>
          {onHoldCart && !returnMode && lines.length > 0 && (
            <button
              type="button"
              disabled={isCheckingOut}
              onClick={onHoldCart}
              title="تعليق الفاتورة"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Pause className="h-3.5 w-3.5 shrink-0" />
              تعليق
            </button>
          )}
          {lines.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              مسح
            </button>
          )}
        </div>
      </div>

      {loyaltyCustomer && (
        <div className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-800">عميل الولاء</p>
            <p className="truncate text-sm font-semibold text-emerald-950">
              {loyaltyCustomer.phone}
            </p>
            <p className="text-xs text-emerald-800">
              {loyaltyCustomer.pointsBalance.toLocaleString()} نقطة
            </p>
            {loyaltyCustomer.pointsBalance >= 1000 && onToggleRedeem && !returnMode && (
              <label className="mt-1 flex items-center gap-2 text-xs font-semibold text-emerald-950">
                <input
                  type="checkbox"
                  checked={redeemPoints}
                  onChange={(e) => onToggleRedeem(e.target.checked)}
                  className="h-4 w-4 rounded border-emerald-400"
                />
                استبدال النقاط
                {redeemPoints && pointsDiscount > 0 ? (
                  <span className="font-medium text-emerald-800">
                    خصم {pointsDiscount} ج.م
                  </span>
                ) : null}
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={onClearLoyaltyCustomer}
            className="rounded-lg px-2 py-1 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
            aria-label="Remove customer"
          >
            X
          </button>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p
              className={clsx(
                "font-medium",
                returnMode ? "text-red-700" : "text-slate-500",
              )}
            >
              {returnMode ? "امسح أصناف المرتجع" : "السلة فارغة"}
            </p>
            <p
              className={clsx(
                "mt-1 text-sm",
                returnMode ? "text-red-600/70" : "text-slate-400",
              )}
            >
              {returnMode
                ? "كل مسح يضيف سطر مرتجع سالب"
                : "امسح الباركود أو اختر منتجاً لبدء البيع"}
            </p>
          </div>
        ) : (
          <ul
            className={clsx(
              "divide-y",
              returnMode ? "divide-red-100" : "divide-slate-100",
            )}
          >
            {lines.map((line) => {
              const isScale = line.isScalePriced || line.isWeighted;
              const hasDiscount =
                line.discountType &&
                line.discountValue != null &&
                line.discountValue > 0;
              const isHighlighted = highlightedItemId === line.product.id;

              return (
                <li
                  key={line.lineId}
                  id={cartItemDomId(line.product.id)}
                  className={clsx(
                    "px-4 py-3 transition-all duration-300",
                    isHighlighted &&
                      (returnMode ? "bg-amber-200/90" : "bg-green-100"),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditLine(line)}
                    className={clsx(
                      "flex w-full items-start justify-between gap-3 rounded-lg text-left",
                      returnMode ? "hover:bg-red-100/60" : "hover:bg-slate-50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={clsx(
                          "truncate text-base font-medium",
                          returnMode ? "text-red-950" : "text-slate-900",
                        )}
                      >
                        {line.product.name}
                      </p>
                      <p
                        className={clsx(
                          "mt-0.5 text-xs",
                          returnMode ? "text-red-700/70" : "text-slate-500",
                        )}
                      >
                        {isScale
                          ? `Scale${line.plu ? ` · PLU ${line.plu}` : ""}`
                          : `${formatEGP(line.unitPrice)} each`}
                        {hasDiscount
                          ? ` · disc ${line.discountType === "percent" ? `${line.discountValue}%` : formatEGP(line.discountValue!)}`
                          : ""}
                      </p>
                    </div>
                    <p
                      className={clsx(
                        "shrink-0 text-lg font-semibold tabular-nums",
                        returnMode ? "text-red-700" : "text-slate-900",
                      )}
                    >
                      {formatEGP(line.lineTotal)}
                    </p>
                  </button>

                  <div className="mt-2 flex items-center justify-between">
                    {isScale ? (
                      <span
                        className={clsx(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-300",
                          isHighlighted
                            ? "scale-110 bg-red-100 text-red-600"
                            : returnMode
                              ? "bg-red-200/70 text-red-900"
                              : "bg-amber-50 text-amber-800",
                        )}
                      >
                        Qty{" "}
                        <span
                          className={clsx(
                            "inline-block transition-all duration-300",
                            isHighlighted &&
                              "scale-110 font-bold text-red-600",
                          )}
                        >
                          {line.qty}
                        </span>{" "}
                        · tap to edit price
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onDecrement(line.lineId);
                            onAfterQtyChange?.();
                          }}
                          className={clsx(
                            "flex h-11 w-11 items-center justify-center rounded-xl border",
                            returnMode
                              ? "border-red-200 hover:bg-red-100"
                              : "border-slate-200 hover:bg-slate-50",
                          )}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditLine(line)}
                          className={clsx(
                            "min-w-10 text-center text-base tabular-nums transition-all duration-300",
                            isHighlighted
                              ? "scale-110 font-bold text-red-600"
                              : returnMode
                                ? "font-semibold text-red-800"
                                : "font-semibold",
                          )}
                        >
                          {line.qty}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onIncrement(line.lineId);
                            onAfterQtyChange?.();
                          }}
                          className={clsx(
                            "flex h-11 w-11 items-center justify-center rounded-xl border",
                            returnMode
                              ? "border-red-200 hover:bg-red-100"
                              : "border-slate-200 hover:bg-slate-50",
                          )}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(line.lineId)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className={clsx(
          "border-t p-4",
          returnMode
            ? "border-red-200 bg-red-100/70"
            : "border-slate-200 bg-slate-50",
        )}
      >
        <div className="flex items-end justify-between">
          <span
            className={clsx(
              "text-sm font-medium",
              returnMode ? "text-red-800" : "text-slate-500",
            )}
          >
            {returnMode ? "المبلغ المرتجع" : "الإجمالي"}
          </span>
          <span
            className={clsx(
              "text-3xl font-bold tabular-nums sm:text-4xl",
              returnMode ? "text-red-800" : "text-slate-900",
            )}
          >
            {formatEGP(total)}
          </span>
        </div>
        {pointsDiscount > 0 && (
          <p className="mt-1 text-xs font-medium text-emerald-800">
            خصم النقاط {pointsDiscount} ج.م
          </p>
        )}
        <button
          type="button"
          disabled={lines.length === 0 || isCheckingOut}
          onClick={onCheckout}
          className={clsx(
            "mt-4 w-full rounded-xl py-4 text-xl font-semibold text-white shadow-sm",
            lines.length === 0 || isCheckingOut
              ? "cursor-not-allowed bg-slate-300"
              : returnMode
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800",
          )}
        >
          {isCheckingOut
            ? "جاري المعالجة…"
            : returnMode
              ? "إتمام الاسترجاع"
              : "الدفع"}
        </button>
      </div>

      {editLine && (
        <CartEditModal
          line={editLine}
          open={!!editLine}
          onClose={() => setEditLine(null)}
          onSave={(patch) => onUpdateLine(editLine.lineId, patch)}
        />
      )}
    </section>
  );
}
