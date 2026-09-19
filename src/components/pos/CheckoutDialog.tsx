"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import type { CachedCustomer, PaymentMethod } from "@/types/woocommerce";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import {
  isCashPayment,
  PAYMENT_METHOD_OPTIONS,
} from "@/lib/pos/paymentMethods";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

const EGP_DENOMINATIONS = [50, 100, 200] as const;

interface CheckoutDialogProps {
  open: boolean;
  total: number;
  isOnline: boolean;
  isSubmitting: boolean;
  error: string | null;
  customers: CachedCustomer[];
  /** When true, checkout is a refund (negative cart). */
  isReturn?: boolean;
  onClose: () => void;
  onConfirm: (input: {
    paymentMethod: PaymentMethod;
    customer: CachedCustomer | null;
    tendered: number;
  }) => Promise<void>;
}

export function CheckoutDialog({
  open,
  total,
  isOnline,
  isSubmitting,
  error,
  customers,
  isReturn = false,
  onClose,
  onConfirm,
}: CheckoutDialogProps) {
  const kb = usePosKeyboardOptional();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");

  const refundAmount = roundMoney(Math.abs(total));

  useEffect(() => {
    if (open) {
      setPaymentMethod("cash");
      setCustomerId("");
      if (isReturn) {
        setTenderedInput(String(refundAmount));
      } else {
        const suggested =
          EGP_DENOMINATIONS.find((d) => d >= total) ??
          Math.ceil(total / 100) * 100;
        setTenderedInput(
          total <= 0 ? "0" : String(Math.max(suggested, Math.ceil(total))),
        );
      }
    }
  }, [open, total, isReturn, refundAmount]);

  useEffect(() => {
    if (!open) kb?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only when dialog closes
  }, [open]);

  const tendered = roundMoney(parseFloat(tenderedInput || "0"));
  const cash = isCashPayment(paymentMethod);
  const change = !isReturn && cash ? roundMoney(tendered - total) : 0;
  const shortfall = !isReturn && cash && tendered + 0.001 < total;
  const customer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) ?? null,
    [customers, customerId],
  );

  if (!open) return null;

  function handleClose() {
    kb?.close();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3">
      <div
        className={clsx(
          "flex max-h-[min(92dvh,780px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl",
          isReturn && "ring-2 ring-red-400",
        )}
      >
        <div
          className={clsx(
            "flex shrink-0 items-center justify-between border-b px-5 py-4",
            isReturn ? "border-red-100 bg-red-50" : "border-slate-200",
          )}
        >
          <div>
            <h2
              className={clsx(
                "text-lg font-semibold",
                isReturn ? "text-red-900" : "text-slate-900",
              )}
            >
              {isReturn ? "استرجاع · Refund" : "Checkout"}
            </h2>
            <p className={clsx("text-sm", isReturn ? "text-red-700/80" : "text-slate-500")}>
              {isReturn
                ? isOnline
                  ? "Refund will restock local + WooCommerce inventory"
                  : "Offline — return saved locally; restock when online"
                : isOnline
                  ? "Order will sync to WooCommerce as completed"
                  : "Offline — queued locally, syncs when online"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <PosKeyboardScrollArea className="flex-1 space-y-4 px-5 py-4">
          <div
            className={clsx(
              "flex items-center justify-between rounded-xl px-4 py-4 text-white",
              isReturn ? "bg-red-700" : "bg-slate-900",
            )}
          >
            <span className="text-sm font-medium text-white/80">
              {isReturn ? "المبلغ المرتجع · Refund Amount" : "Amount due"}
            </span>
            <span className="text-3xl font-bold tabular-nums">
              {formatEGP(isReturn ? refundAmount : total)}
            </span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {isReturn ? "Refund method" : "Payment method"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAYMENT_METHOD_OPTIONS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethod(method.id)}
                  className={clsx(
                    "rounded-xl border px-2 py-3 text-center text-sm font-semibold",
                    paymentMethod === method.id
                      ? isReturn
                        ? "border-red-600 bg-red-50 text-red-700"
                        : "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">{method.labelAr}</span>
                  <span className="mt-0.5 block text-xs font-medium opacity-80">
                    {method.labelEn}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {cash && !isReturn && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Cash provided (EGP)
              </p>

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setTenderedInput(total.toFixed(2))}
                  className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                >
                  Exact
                </button>
                {EGP_DENOMINATIONS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTenderedInput(String(amount))}
                    className={clsx(
                      "rounded-xl border py-3 text-sm font-bold tabular-nums hover:border-brand-400 hover:bg-brand-50",
                      tendered === amount
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-800",
                    )}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Or enter amount
                </span>
                <PosKeyboardInput
                  inputName="checkout-cash"
                  mode="numpad"
                  type="text"
                  inputMode="none"
                  value={tenderedInput}
                  onChange={setTenderedInput}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-lg font-semibold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </label>

              <div
                className={clsx(
                  "flex items-center justify-between rounded-xl px-4 py-3",
                  shortfall
                    ? "bg-red-100 text-red-800"
                    : "bg-brand-600 text-white",
                )}
              >
                <span className="text-sm font-medium">
                  {shortfall ? "Still due" : "Change to give"}
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatEGP(shortfall ? total - tendered : Math.max(0, change))}
                </span>
              </div>
            </div>
          )}

          {cash && isReturn && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              Cash will be removed from the drawer and deducted from this
              shift&apos;s cash sales on the Z-Report.
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Customer
            </span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.first_name} ${c.last_name}`.trim() || c.email}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </p>
          )}
        </PosKeyboardScrollArea>

        <div className="shrink-0 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            disabled={isSubmitting || shortfall}
            onClick={() =>
              onConfirm({
                paymentMethod,
                customer,
                tendered: cash
                  ? isReturn
                    ? refundAmount
                    : tendered
                  : refundAmount,
              })
            }
            className={clsx(
              "w-full rounded-xl py-3.5 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300",
              isReturn
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {isSubmitting
              ? "Completing…"
              : isReturn
                ? "Complete refund"
                : "Complete sale"}
          </button>
        </div>
      </div>
    </div>
  );
}
