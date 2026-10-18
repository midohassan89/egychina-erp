"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function NotificationsPage() {
  const [titleAr, setTitleAr] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyZh, setBodyZh] = useState("");
  const [phone, setPhone] = useState("");
  const [all, setAll] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(null);
  }, [titleAr, bodyAr, phone, all]);

  async function translate() {
    setStatus(null);
    const [titleRes, bodyRes] = await Promise.all([
      fetch("/api/admin/translate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: titleAr }),
      }),
      fetch("/api/admin/translate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bodyAr }),
      }),
    ]);
    const title = (await titleRes.json()) as { en?: string; zh?: string; error?: string };
    const text = (await bodyRes.json()) as { en?: string; zh?: string; error?: string };
    if (!titleRes.ok || !bodyRes.ok) {
      setStatus(title.error || text.error || "تعذر الترجمة");
      return;
    }
    setTitleEn(title.en ?? "");
    setTitleZh(title.zh ?? "");
    setBodyEn(text.en ?? "");
    setBodyZh(text.zh ?? "");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/dashboard/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleAr,
          bodyAr,
          titleEn,
          titleZh,
          bodyEn,
          bodyZh,
          all,
          phone: all ? "" : phone,
        }),
      });
      const data = (await res.json()) as { error?: string; sent?: number };
      if (!res.ok) throw new Error(data.error ?? "تعذر الإرسال");
      setStatus(`تم الإرسال إلى ${data.sent ?? 0} عميل`);
      setTitleAr("");
      setBodyAr("");
      setTitleEn("");
      setTitleZh("");
      setBodyEn("");
      setBodyZh("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر الإرسال");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100";

  return (
    <form onSubmit={(event) => void send(event)} className="mx-auto max-w-3xl space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">إشعارات العملاء</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          اكتب الإشعار بالعربية، ثم ترجمه وعدّل الإنجليزية والصينية قبل الإرسال.
        </p>
      </div>
      <label className="block text-sm font-medium text-slate-700 dark:text-gray-200">
        العنوان بالعربية
        <input required value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className={`mt-1 ${field}`} />
      </label>
      <label className="block text-sm font-medium text-slate-700 dark:text-gray-200">
        النص بالعربية
        <textarea required rows={4} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} className={`mt-1 ${field}`} />
      </label>
      <button type="button" onClick={() => void translate()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-gray-800 dark:text-gray-200">
        ترجمة إلى الإنجليزية والصينية
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="English title" dir="ltr" className={field} />
        <input value={titleZh} onChange={(e) => setTitleZh(e.target.value)} placeholder="中文标题" dir="ltr" className={field} />
        <textarea rows={3} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} placeholder="English body" dir="ltr" className={field} />
        <textarea rows={3} value={bodyZh} onChange={(e) => setBodyZh(e.target.value)} placeholder="中文内容" dir="ltr" className={field} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        إرسال لكل العملاء
      </label>
      {!all && (
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم هاتف العميل" dir="ltr" className={field} />
      )}
      {status && <p className="text-sm text-slate-700 dark:text-gray-200">{status}</p>}
      <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">
        {saving ? "جاري الإرسال…" : "إرسال الإشعار"}
      </button>
    </form>
  );
}
