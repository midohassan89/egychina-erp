"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export async function translateArabicName(
  text: string,
): Promise<{ en: string; zh: string } | null> {
  const res = await fetch("/api/admin/translate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json()) as { en?: string; zh?: string };
  const en = data.en?.trim() ?? "";
  const zh = data.zh?.trim() ?? "";
  if (!res.ok || !en || !zh) return null;
  return { en, zh };
}

export function QuickNameDialog({
  open,
  title,
  onClose,
  onSave,
  matchesExisting,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
  /** Return true when the trimmed Arabic name is already in the list. */
  matchesExisting?: (name: string) => boolean;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setSaving(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("يرجى كتابة الاسم بالعربية أولاً");
      return;
    }
    if (matchesExisting?.(trimmed)) {
      onClose();
      return;
    }
    const run = ++runRef.current;
    setSaving(true);
    setError(null);
    try {
      const message = await onSave(trimmed);
      if (runRef.current !== run) return;
      if (message) {
        setError(message);
        setSaving(false);
        return;
      }
      onClose();
    } catch {
      if (runRef.current !== run) return;
      setError("تعذر الحفظ");
      setSaving(false);
    }
  }

  function cancel() {
    if (saving) return;
    runRef.current += 1;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-name-title"
        dir="rtl"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="quick-name-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">الاسم بالعربية</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
              if (e.key === "Escape") cancel();
            }}
            disabled={saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "جاري الحفظ والترجمة..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}
