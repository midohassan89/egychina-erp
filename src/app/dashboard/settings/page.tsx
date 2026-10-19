"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

export default function SettingsPage() {
  const [earnRatio, setEarnRatio] = useState("");
  const [redeemValue, setRedeemValue] = useState("");
  const [redeemStep, setRedeemStep] = useState("10000");
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const body = (await res.json()) as {
        error?: string;
        points_earn_ratio?: number;
        points_redeem_value?: number;
        points_redeem_step?: number;
        store_name?: string;
        store_phone?: string;
        receipt_footer?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load settings");
      setEarnRatio(String(body.points_earn_ratio ?? ""));
      setRedeemValue(String(body.points_redeem_value ?? ""));
      setRedeemStep(String(body.points_redeem_step ?? 10000));
      setStoreName(body.store_name ?? "");
      setStorePhone(body.store_phone ?? "");
      setReceiptFooter(body.receipt_footer ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earn = Number(earnRatio);
  const redeem = Number(redeemValue);
  const previewEarn =
    Number.isFinite(earn) && earn > 0 ? earn : null;
  const previewRedeem =
    Number.isFinite(redeem) && redeem > 0 ? redeem : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    if (previewEarn == null || previewRedeem == null) {
      setError("أدخل قيماً أكبر من صفر");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points_earn_ratio: previewEarn,
          points_redeem_value: previewRedeem,
          points_redeem_step: Number(redeemStep),
          store_name: storeName,
          store_phone: storePhone,
          receipt_footer: receiptFooter,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        points_earn_ratio?: number;
        points_redeem_value?: number;
        points_redeem_step?: number;
        store_name?: string;
        store_phone?: string;
        receipt_footer?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not save settings");
      setEarnRatio(String(body.points_earn_ratio ?? previewEarn));
      setRedeemValue(String(body.points_redeem_value ?? previewRedeem));
      setRedeemStep(String(body.points_redeem_step ?? redeemStep));
      setStoreName(body.store_name ?? storeName);
      setStorePhone(body.store_phone ?? storePhone);
      setReceiptFooter(body.receipt_footer ?? receiptFooter);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">الإعدادات</h1>
        <p className="mt-1 text-slate-500 dark:text-gray-400">
          إعدادات المتجر المحفوظة في قاعدة البيانات
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
            نظام مكافآت النقاط
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            هذه القيم تُستخدم عند طلبات المتجر بدلاً من الأرقام الثابتة.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-gray-400">جاري التحميل…</p>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                نقاط الكسب لكل 1 جنيه
              </span>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={earnRatio}
                onChange={(e) => {
                  setEarnRatio(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-gray-400">
                points_earn_ratio — عدد النقاط التي يحصل عليها العميل عن كل 1
                جنيه مدفوع من قيمة البضاعة.
                {previewEarn != null
                  ? ` مثال: 100 جنيه = ${(previewEarn * 100).toLocaleString("ar-EG")} نقطة.`
                  : ""}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                نقاط الاستبدال لكل 1 جنيه
              </span>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={redeemValue}
                onChange={(e) => {
                  setRedeemValue(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-gray-400">
                points_redeem_value — عدد النقاط اللازمة لخصم 1 جنيه عند
                الاستبدال.
                {previewRedeem != null
                  ? ` مثال: ${previewRedeem.toLocaleString("ar-EG")} نقطة = 1 جنيه.`
                  : ""}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
                الحد الأدنى لاستبدال النقاط
              </span>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={redeemStep}
                onChange={(e) => {
                  setRedeemStep(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>

            <div className="border-t border-slate-200 pt-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                الفاتورة والمتجر
              </h2>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">اسم المتجر</span>
              <input value={storeName} onChange={(e) => { setStoreName(e.target.value); setSaved(false); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">هاتف / واتساب خدمة العملاء</span>
              <input value={storePhone} onChange={(e) => { setStorePhone(e.target.value); setSaved(false); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">نص تذييل إيصال الكاشير</span>
              <textarea rows={3} value={receiptFooter} onChange={(e) => { setReceiptFooter(e.target.value); setSaved(false); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100" />
            </label>
          </>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            تم حفظ إعدادات النقاط
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || isSaving}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isSaving ? "جاري الحفظ…" : "حفظ الإعدادات"}
          </button>
        </div>
      </form>
    </div>
  );
}
