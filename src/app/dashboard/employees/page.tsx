"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEGP } from "@/lib/pos/money";

interface EmployeeRow {
  id: number;
  name: string;
  isActive: boolean;
  baseSalary: number;
  hireDate: string;
  createdAt: string;
  netSalary: number;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [name, setName] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [hireDate, setHireDate] = useState(() => todayInput());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employees?all=1");
      const body = (await res.json()) as {
        error?: string;
        employees?: EmployeeRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load employees");
      setEmployees(body.employees ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          baseSalary: Number(baseSalary) || 0,
          hireDate: hireDate || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not add employee");
      setName("");
      setBaseSalary("");
      setHireDate(todayInput());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add employee");
    } finally {
      setIsSaving(false);
    }
  }

  async function setActive(employee: EmployeeRow, isActive: boolean) {
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employee.id, isActive }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not update employee");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update employee");
    }
  }

  const active = employees.filter((employee) => employee.isActive);
  const inactive = employees.filter((employee) => !employee.isActive);

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">الموظفين والرواتب</h1>
        <p className="mt-1 text-slate-500">
          إدارة الموظفين، السلف، الخصومات، المكافآت، وصرف الرواتب — وكشف الحساب
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            اسم الموظف
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم الموظف"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            الراتب الأساسي
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            تاريخ التعيين
          </span>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
        >
          {isSaving ? "جاري الحفظ…" : "إضافة موظف"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          نشط ({active.length})
        </h2>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-500">جاري التحميل…</p>
        ) : active.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400">لا يوجد موظفون نشطون بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">الموظف</th>
                  <th className="px-4 py-3 text-right font-semibold">الراتب الأساسي</th>
                  <th className="px-4 py-3 text-right font-semibold">صافي الراتب</th>
                  <th className="px-4 py-3 text-right font-semibold">التعيين</th>
                  <th className="px-4 py-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {employee.name}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatEGP(employee.baseSalary)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">
                      {formatEGP(employee.netSalary)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(employee.hireDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/employees/${employee.id}`}
                          className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                        >
                          كشف الحساب
                        </Link>
                        <button
                          type="button"
                          onClick={() => void setActive(employee, false)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          تعطيل
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-500">
            غير نشط ({inactive.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {inactive.map((employee) => (
              <li
                key={employee.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <span className="text-slate-500">{employee.name}</span>
                  <span className="mr-3 text-xs text-slate-400">
                    أساسي {formatEGP(employee.baseSalary)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/employees/${employee.id}`}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    كشف الحساب
                  </Link>
                  <button
                    type="button"
                    onClick={() => void setActive(employee, true)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    تفعيل
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ar-EG");
  } catch {
    return iso;
  }
}
