"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { RefreshCw, X } from "lucide-react";
import type { CachedCustomer, PaymentMethod } from "@/types/woocommerce";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import {
  DEFAULT_CNY_EXCHANGE_RATE,
  isCashPayment,
  isExactDigitalPayment,
  isStaffMealPayment,
  isWeChatPayment,
  PAYMENT_METHOD_OPTIONS,
} from "@/lib/pos/paymentMethods";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";
import { ToastProvider, useToast } from "@/components/ui/Toast";

const EGP_DENOMINATIONS = [50, 100, 200] as const;
const LIVE_CNY_RATE_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json";
/** Subtract 4% from the live CNY→EGP rate so the merchant never under-quotes CNY. */
const CNY_RATE_SAFETY_MARGIN = 0.04;

interface CheckoutDialogProps {
  open: boolean;
  total: number;
  isOnline: boolean;
  isSubmitting: boolean;
  error: string | null;
  customers: CachedCustomer[];
  /** When true, checkout is a refund (negative cart). */
  isReturn?: boolean;
  /** Live payment preview for the customer-facing display. */
  onPaymentPreview?: (preview: {
    paymentMethod: PaymentMethod;
    paidAmount: number;
    changeAmount: number;
    exchangeRate?: number | null;
  } | null) => void;
  onClose: () => void;
  onConfirm: (input: {
    paymentMethod: PaymentMethod;
    customer: CachedCustomer | null;
    tendered: number;
    employeeId: number | null;
    employeeName: string | null;
  }) => Promise<void>;
}

export function CheckoutDialog(props: CheckoutDialogProps) {
  if (!props.open) return null;
  return (
    <ToastProvider>
      <CheckoutDialogInner {...props} />
    </ToastProvider>
  );
}

function CheckoutDialogInner({
  open,
  total,
  isOnline,
  isSubmitting,
  error,
  customers,
  isReturn = false,
  onPaymentPreview,
  onClose,
  onConfirm,
}: CheckoutDialogProps) {
  const kb = usePosKeyboardOptional();
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(DEFAULT_CNY_EXCHANGE_RATE);
  const [exchangeRateInput, setExchangeRateInput] = useState(
    String(DEFAULT_CNY_EXCHANGE_RATE),
  );
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  const refundAmount = roundMoney(Math.abs(total));

  useEffect(() => {
    if (open) {
      setPaymentMethod("cash");
      setCustomerId("");
      setEmployeeId("");
      setExchangeRate(DEFAULT_CNY_EXCHANGE_RATE);
      setExchangeRateInput(String(DEFAULT_CNY_EXCHANGE_RATE));
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

  // WeChat / InstaPay: exact digital amount — no change for the customer.
  useEffect(() => {
    if (!open || isReturn) return;
    if (!isExactDigitalPayment(paymentMethod)) return;
    setTenderedInput(String(roundMoney(Math.abs(total))));
  }, [open, isReturn, paymentMethod, total]);

  const fetchLiveExchangeRate = useCallback(async () => {
    setIsFetchingRate(true);
    const toastNotify = {
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    };
    try {
      const res = await fetch(LIVE_CNY_RATE_URL, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        cny?: { egp?: number };
      };
      const rawRate = data.cny?.egp;
      if (
        typeof rawRate !== "number" ||
        !Number.isFinite(rawRate) ||
        rawRate <= 0
      ) {
        throw new Error("EGP rate missing");
      }
      const safeRate = rawRate - rawRate * CNY_RATE_SAFETY_MARGIN;
      const finalRate = Number(safeRate.toFixed(2));
      if (!Number.isFinite(finalRate) || finalRate <= 0) {
        throw new Error("Safe rate invalid");
      }
      setExchangeRate(finalRate);
      setExchangeRateInput(String(finalRate));
      toastNotify.success("تم تحديث السعر بنجاح");
    } catch {
      toastNotify.error("تعذر جلب سعر الصرف — تحقق من الاتصال");
    } finally {
      setIsFetchingRate(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open || isReturn) return;
    let cancelled = false;
    setEmployeesLoading(true);
    setEmployeesError(null);
    void (async () => {
      try {
        const res = await fetch("/api/employees");
        const body = (await res.json()) as {
          error?: string;
          employees?: { id: number; name: string }[];
        };
        if (!res.ok) throw new Error(body.error ?? "Could not load employees");
        if (!cancelled) setEmployees(body.employees ?? []);
      } catch (err) {
        if (!cancelled) {
          setEmployees([]);
          setEmployeesError(
            err instanceof Error ? err.message : "Could not load employees",
          );
        }
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isReturn]);

  useEffect(() => {
    if (!open) kb?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only when dialog closes
  }, [open]);

  const tendered = roundMoney(parseFloat(tenderedInput || "0"));
  const cash = isCashPayment(paymentMethod);
  const staffMeal = isStaffMealPayment(paymentMethod);
  const wechat = isWeChatPayment(paymentMethod);
  const exactDigital = isExactDigitalPayment(paymentMethod);
  const safeExchangeRate =
    Number.isFinite(exchangeRate) && exchangeRate > 0
      ? exchangeRate
      : DEFAULT_CNY_EXCHANGE_RATE;
  const cnyAmount = wechat ? Math.abs(total) / safeExchangeRate : 0;
  const change = !isReturn && cash ? roundMoney(tendered - total) : 0;

  useEffect(() => {
    if (!onPaymentPreview) return;
    if (!open) {
      onPaymentPreview(null);
      return;
    }
    onPaymentPreview({
      paymentMethod,
      paidAmount: staffMeal
        ? 0
        : cash
          ? isReturn
            ? Math.abs(total)
            : tendered
          : Math.abs(total),
      changeAmount:
        staffMeal || isReturn || exactDigital ? 0 : Math.max(0, change),
      exchangeRate: wechat ? safeExchangeRate : null,
    });
  }, [
    open,
    paymentMethod,
    tendered,
    change,
    cash,
    staffMeal,
    wechat,
    exactDigital,
    safeExchangeRate,
    isReturn,
    total,
    onPaymentPreview,
  ]);
  const shortfall = !isReturn && cash && tendered + 0.001 < total;
  const selectedEmployee =
    employees.find((employee) => String(employee.id) === employeeId) ?? null;
  const employeeMissing = staffMeal && !selectedEmployee;
  const paymentOptions = isReturn
    ? PAYMENT_METHOD_OPTIONS.filter((method) => method.id !== "STAFF_MEAL")
    : PAYMENT_METHOD_OPTIONS;
  const customer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) ?? null,
    [customers, customerId],
  );

  function handleClose() {
    kb?.close();
    onClose();
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3"
    >
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
              {isReturn ? "استرجاع" : "إتمام الدفع"}
            </h2>
            <p className={clsx("text-sm", isReturn ? "text-red-700/80" : "text-slate-500")}>
              {isReturn
                ? isOnline
                  ? "سيتم إرجاع الكمية للمخزون"
                  : "غير متصل — يُحفظ المرتجع محلياً ويُحدَّث المخزون عند الاتصال"
                : isOnline
                  ? "سيتم حفظ الطلب ومزامنته"
                  : "غير متصل — يُحفظ محلياً ويُزامَن عند الاتصال"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="إغلاق"
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
              {isReturn ? "المبلغ المرتجع" : "المبلغ المطلوب"}
            </span>
            <span className="text-3xl font-bold tabular-nums">
              {formatEGP(isReturn ? refundAmount : total)}
            </span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {isReturn ? "طريقة الاسترجاع" : "طريقة الدفع"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {paymentOptions.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethod(method.id)}
                  className={clsx(
                    "rounded-xl border px-2 py-3 text-center text-sm font-semibold",
                    paymentMethod === method.id
                      ? method.id === "STAFF_MEAL"
                        ? "border-amber-600 bg-amber-50 text-amber-800"
                        : method.id === "wechat"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : method.id === "instapay"
                            ? "border-[#5b2b8c] bg-purple-50 text-[#5b2b8c]"
                            : isReturn
                              ? "border-red-600 bg-red-50 text-red-700"
                              : "border-brand-600 bg-brand-50 text-brand-700"
                      : method.id === "STAFF_MEAL"
                        ? "border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-50"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="block">{method.labelAr}</span>
                </button>
              ))}
            </div>
          </div>

          {wechat && !isReturn && (
            <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
              <div>
                <span className="mb-1 block text-sm font-semibold text-emerald-950">
                  سعر الصرف (يوان/جنيه)
                </span>
                <div className="flex items-stretch gap-2">
                  <PosKeyboardInput
                    inputName="checkout-cny-rate"
                    mode="numpad"
                    type="text"
                    inputMode="none"
                    value={exchangeRateInput}
                    onChange={(value) => {
                      setExchangeRateInput(value);
                      const parsed = parseFloat(value.replace(/,/g, "."));
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setExchangeRate(parsed);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-3 text-lg font-semibold tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                  />
                  <button
                    type="button"
                    title="جلب السعر الحالي للبنك"
                    disabled={isFetchingRate || isSubmitting}
                    onClick={() => void fetchLiveExchangeRate()}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={clsx(
                        "h-5 w-5",
                        isFetchingRate && "animate-spin",
                      )}
                    />
                  </button>
                </div>
                <span className="mt-1 block text-xs text-emerald-800/80">
                  مثال: 7 يعني 7 ج.م ≈ 1 يوان — أو اجلب السعر الحي من البنك
                </span>
              </div>
              <div className="rounded-xl bg-emerald-600 px-4 py-4 text-white shadow-sm">
                <p className="text-sm font-medium text-emerald-100">
                  المبلغ المطلوب باليوان
                </p>
                <p className="text-xs text-emerald-100/90" lang="zh-CN" dir="ltr">
                  人民币金额
                </p>
                <p
                  className="mt-1 text-3xl font-black tabular-nums tracking-tight"
                  dir="ltr"
                >
                  ¥ {cnyAmount.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {staffMeal && (
            <label className="block rounded-xl border border-amber-200 bg-amber-50 p-4">
              <span className="mb-1 block text-sm font-semibold text-amber-950">
                الموظف
              </span>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-3 text-base font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30"
              >
                <option value="">
                  {employeesLoading ? "جاري التحميل…" : "اختر الموظف…"}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
              {employeesError && (
                <p className="mt-2 text-xs text-red-700">{employeesError}</p>
              )}
              {!employeesLoading && employees.length === 0 && !employeesError && (
                <p className="mt-2 text-xs text-amber-800">
                  لا يوجد موظفون نشطون. يمكن للإدارة إضافتهم من صفحة الموظفين.
                </p>
              )}
              <p className="mt-2 text-xs text-amber-800">
                يُخصم المخزون. لا يتم تحصيل نقدية.
              </p>
            </label>
          )}

          {cash && !isReturn && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                النقدية المستلمة (ج.م)
              </p>

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setTenderedInput(total.toFixed(2))}
                  className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                >
                  المبلغ بالضبط
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
                  أو أدخل المبلغ يدوياً
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
                  {shortfall ? "المتبقي للتحصيل" : "الباقي للعميل"}
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatEGP(shortfall ? total - tendered : Math.max(0, change))}
                </span>
              </div>
            </div>
          )}

          {cash && isReturn && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              سيتم خصم النقدية من درج الكاشير ومن مبيعات النقدية في تقرير الوردية.
            </div>
          )}

          {!staffMeal && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              العميل
            </span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">عميل نقدي (بدون تسجيل)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.first_name} ${c.last_name}`.trim() || c.email}
                </option>
              ))}
            </select>
          </label>
          )}

          {error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </p>
          )}
        </PosKeyboardScrollArea>

        <div className="shrink-0 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            disabled={isSubmitting || shortfall || employeeMissing}
            onClick={() =>
              onConfirm({
                paymentMethod,
                customer: staffMeal ? null : customer,
                tendered: staffMeal
                  ? 0
                  : cash
                    ? isReturn
                      ? refundAmount
                      : tendered
                    : refundAmount,
                employeeId: staffMeal ? (selectedEmployee?.id ?? null) : null,
                employeeName: staffMeal ? (selectedEmployee?.name ?? null) : null,
              })
            }
            className={clsx(
              "w-full rounded-xl py-3.5 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300",
              isReturn
                ? "bg-red-600 hover:bg-red-700"
                : staffMeal
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {isSubmitting
              ? "جاري الإتمام…"
              : isReturn
                ? "إتمام الاسترجاع"
                : staffMeal
                  ? "تسجيل وجبة العمال"
                  : "إتمام البيع والتأكيد"}
          </button>
        </div>
      </div>
    </div>
  );
}
