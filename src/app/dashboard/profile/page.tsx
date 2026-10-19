"use client";

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("كلمة المرور الجديدة وتأكيدها غير متطابقين");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذر تحديث كلمة المرور");
      setSuccess("تم تحديث كلمة المرور");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">ملفي الشخصي</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          يمكنك تحديث كلمة المرور من هنا.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <dl className="mb-6 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500 dark:text-gray-400">اسم المستخدم</dt>
            <dd className="font-medium text-slate-900 dark:text-gray-100">
              {session?.user?.name ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500 dark:text-gray-400">الصلاحية</dt>
            <dd className="font-medium text-slate-900 dark:text-gray-100">
              {(
                {
                  ADMIN: "مدير",
                  MANAGER: "مدير تشغيل",
                  ACCOUNTANT: "محاسب",
                  CASHIER: "كاشير",
                  DRIVER: "سائق",
                } as Record<string, string>
              )[session?.user?.role ?? ""] ?? session?.user?.role ?? "—"}
            </dd>
          </div>
        </dl>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
              كلمة المرور الحالية
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
              كلمة المرور الجديدة
            </span>
            <input
              type="password"
              required
              minLength={4}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200">
              تأكيد كلمة المرور
            </span>
            <input
              type="password"
              required
              minLength={4}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isSaving ? "جاري التحديث…" : "تحديث كلمة المرور"}
          </button>
        </form>
      </div>
    </div>
  );
}
