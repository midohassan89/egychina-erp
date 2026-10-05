"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  PaymentSourceSelect,
  parseSourceValue,
} from "@/components/dashboard/hr/PaymentSourceSelect";
import { deductionAmountFromDays } from "@/lib/hr/calculations";

export type HrModalKind = "ADVANCE" | "DEDUCTION" | "BONUS" | "SALARY_PAYMENT";

interface HrTransactionModalProps {
  open: boolean;
  kind: HrModalKind;
  employeeId: number;
  employeeName: string;
  baseSalary: number;
  onClose: () => void;
  onSaved: () => void;
}

const TITLES: Record<HrModalKind, string> = {
  ADVANCE: "تسجيل سلفة",
  DEDUCTION: "تسجيل خصم",
  BONUS: "تسجيل مكافأة",
  SALARY_PAYMENT: "صرف راتب",
};

export function HrTransactionModal({
  open,
  kind,
  employeeId,
  employeeName,
  baseSalary,
  onClose,
  onSaved,
}: HrTransactionModalProps) {
  const [amount, setAmount] = useState("");
  const [daysDeducted, setDaysDeducted] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => todayInput());
  const [paymentSource, setPaymentSource] = useState("TREASURY");
  const [immediatePayment, setImmediatePayment] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDaysDeducted("");
    setNote("");
    setDate(todayInput());
    setPaymentSource("TREASURY");
    setImmediatePayment(true);
    setError(null);
  }, [open, kind]);

  const needsSafe =
    kind === "ADVANCE" ||
    kind === "SALARY_PAYMENT" ||
    (kind === "BONUS" && immediatePayment);

  const computedDeduction = useMemo(() => {
    if (kind !== "DEDUCTION") return null;
    const days = Number(daysDeducted);
    if (!Number.isFinite(days) || days <= 0) return null;
    return deductionAmountFromDays(baseSalary, days);
  }, [kind, daysDeducted, baseSalary]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const source = parseSourceValue(paymentSource);
      const payload: Record<string, unknown> = {
        type: kind,
        note: note.trim() || null,
        date: date ? new Date(date).toISOString() : null,
      };

      if (kind === "DEDUCTION" && Number(daysDeducted) > 0) {
        payload.daysDeducted = Number(daysDeducted);
        payload.amount = computedDeduction ?? 0;
      } else {
        payload.amount = Number(amount);
      }

      if (kind === "BONUS") {
        payload.immediatePayment = immediatePayment;
      }
      if (needsSafe) {
        payload.sourceType = source.sourceType;
        payload.bankAccountId = source.bankAccountId;
      }

      const res = await fetch(`/api/employees/${employeeId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{TITLES[kind]}</h2>
            <p className="text-sm text-slate-500">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">التاريخ</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          {kind === "DEDUCTION" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  أيام الخصم
                </span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  required
                  value={daysDeducted}
                  onChange={(e) => setDaysDeducted(e.target.value)}
                  placeholder="مثال: 2"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                مبلغ الخصم = الراتب الأساسي ÷ 30 × الأيام
                <div className="mt-1 text-base font-bold tabular-nums text-slate-900">
                  {computedDeduction != null
                    ? `${computedDeduction.toLocaleString("ar-EG", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ج.م`
                    : "—"}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  الراتب الأساسي:{" "}
                  {baseSalary.toLocaleString("ar-EG", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  ج.م
                </p>
              </div>
            </>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                المبلغ
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          )}

          {kind === "BONUS" && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">
                طريقة المكافأة
              </legend>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  name="bonusMode"
                  checked={immediatePayment}
                  onChange={() => setImmediatePayment(true)}
                />
                صرف فوري (خصم من الخزينة)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  name="bonusMode"
                  checked={!immediatePayment}
                  onChange={() => setImmediatePayment(false)}
                />
                إضافة للراتب (بدون صرف نقدي)
              </label>
            </fieldset>
          )}

          {needsSafe && (
            <PaymentSourceSelect
              value={paymentSource}
              onChange={setPaymentSource}
              required
              disabled={saving}
            />
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              ملاحظة (اختياري)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
            >
              {saving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
