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
  const [history, setHistory] = useState<
    {
      id: string;
      titleAr: string;
      titleEn: string;
      titleZh: string;
      createdAt: string;
      audience: string;
    }[]
  >([]);

  async function loadHistory() {
    const res = await fetch("/api/dashboard/notifications");
    if (!res.ok) return;
    const body = (await res.json()) as {
      notifications?: {
        id: string;
        titleAr: string;
        titleEn: string;
        titleZh: string;
        type: string;
        createdAt: string;
        customer: { phone: string } | null;
      }[];
    };
    const groups = new Map<string, (typeof history)[number] & { count: number }>();
    for (const row of body.notifications ?? []) {
      if (row.type !== "BROADCAST") continue;
      const key = `${row.titleAr}|${row.createdAt.slice(0, 16)}`;
      const current = groups.get(key);
      if (current) {
        current.count += 1;
        current.audience = "كل العملاء";
      } else {
        groups.set(key, {
          id: row.id,
          titleAr: row.titleAr,
          titleEn: row.titleEn,
          titleZh: row.titleZh,
          createdAt: row.createdAt,
          audience: row.customer?.phone || "عميل محدد",
          count: 1,
        });
      }
    }
    setHistory([...groups.values()].slice(0, 30));
  }

  useEffect(() => {
    void loadHistory();
  }, []);

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
      void loadHistory();
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
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
    <form onSubmit={(event) => void send(event)} className="space-y-4">
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">
        سجل آخر الإشعارات المرسلة
      </h2>
      <table className="min-w-full text-sm">
        <thead className="text-xs text-slate-500 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2 text-right">العنوان</th>
            <th className="px-3 py-2 text-right">التاريخ</th>
            <th className="px-3 py-2 text-right">المستلم</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-slate-500 dark:text-slate-300">
                لا توجد إشعارات مرسلة بعد
              </td>
            </tr>
          ) : (
            history.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 text-slate-900 dark:text-white">
                  <p>{row.titleAr}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300" dir="ltr">{row.titleEn} · {row.titleZh}</p>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-200">
                  {new Date(row.createdAt).toLocaleString("ar-EG")}
                </td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-100">{row.audience}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
    </div>
  );
}
