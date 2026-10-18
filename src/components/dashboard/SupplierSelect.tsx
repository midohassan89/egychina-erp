"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

interface SupplierOption {
  id: number;
  name: string;
}

function SupplierSelectFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (supplierId: string) => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/suppliers", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = (await res.json()) as { suppliers?: SupplierOption[] };
        return (data.suppliers ?? [])
          .filter((supplier) => supplier && supplier.id)
          .map((supplier) => ({
            id: Number(supplier.id),
            name: String(supplier.name ?? ""),
          }));
      })
      .then((list) => {
        if (!cancelled) {
          setSuppliers(list);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuppliers([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectExistingSupplier(newName: string): boolean {
    const existingItem = suppliers.find(
      (supplier) => supplier.name.trim() === newName.trim(),
    );
    if (!existingItem) return false;
    onChange(String(existingItem.id));
    toast("هذا المورد موجود بالفعل، تم اختياره تلقائياً", "info");
    return true;
  }

  async function createSupplier(
    name: string,
    phone: string,
  ): Promise<string | null> {
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: phone.trim() || null,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      supplier?: { id?: number; name?: string };
    };
    if (!res.ok || !data.supplier?.id) {
      return data.error || "تعذر حفظ المورد";
    }

    const created = {
      id: Number(data.supplier.id),
      name: String(data.supplier.name || name),
    };
    setSuppliers((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    );
    onChange(String(created.id));
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
        >
          <option value="">
            {loaded && suppliers.length === 0 ? "لا يوجد موردون" : "اختر المورد…"}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="إضافة مورد"
          aria-label="إضافة مورد"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-brand-400"
        >
          <Plus size={18} />
        </button>
      </div>
      <SupplierCreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        matchesExisting={selectExistingSupplier}
        onSave={createSupplier}
      />
    </>
  );
}

function SupplierCreateDialog({
  open,
  onClose,
  matchesExisting,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  matchesExisting: (name: string) => boolean;
  onSave: (name: string, phone: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setError(null);
    setSaving(false);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("يرجى كتابة اسم المورد أولاً");
      return;
    }
    if (matchesExisting(trimmed)) {
      onClose();
      return;
    }
    const run = ++runRef.current;
    setSaving(true);
    setError(null);
    try {
      const message = await onSave(trimmed, phone);
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

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
    if (event.key === "Escape") cancel();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-create-title"
        dir="rtl"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <h2
          id="supplier-create-title"
          className="text-base font-semibold text-slate-900 dark:text-gray-100"
        >
          إضافة مورد جديد
        </h2>
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-gray-200">اسم المورد</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          />
        </label>
        <label className="mt-3 block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
            رقم الهاتف (اختياري)
          </span>
          <input
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-left text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
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
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupplierSelect(props: {
  value: string;
  onChange: (supplierId: string) => void;
}) {
  return (
    <ToastProvider>
      <SupplierSelectFields {...props} />
    </ToastProvider>
  );
}
