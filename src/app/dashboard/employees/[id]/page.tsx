"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Banknote, Gift, MinusCircle, Wallet } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";
import {
  HrTransactionModal,
  type HrModalKind,
} from "@/components/dashboard/hr/HrTransactionModal";

interface EmployeeDetail {
  id: number;
  name: string;
  isActive: boolean;
  baseSalary: number;
  hireDate: string;
  createdAt: string;
  netSalary: number;
}

interface LedgerRow {
  id: number;
  date: string;
  amount: number;
  type: string;
  typeLabel: string;
  daysDeducted: number | null;
  note: string | null;
  expenseId: number | null;
  paidFromSafe: boolean;
}

export default function EmployeeLedgerPage() {
  const params = useParams();
  const id = Number(params?.id);

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<HrModalKind | null>(null);

  const [editSalary, setEditSalary] = useState("");
  const [editHireDate, setEditHireDate] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}`);
      const body = (await res.json()) as {
        error?: string;
        employee?: EmployeeDetail;
        transactions?: LedgerRow[];
      };
      if (!res.ok || !body.employee) {
        throw new Error(body.error ?? "Failed to load employee");
      }
      setEmployee(body.employee);
      setTransactions(body.transactions ?? []);
      setEditSalary(String(body.employee.baseSalary ?? 0));
      setEditHireDate(toDateInput(body.employee.hireDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setSavingProfile(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: employee.id,
          baseSalary: Number(editSalary) || 0,
          hireDate: editHireDate || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not update");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setSavingProfile(false);
    }
  }

  if (!Number.isFinite(id) || id <= 0) {
    return <p className="p-6 text-sm text-red-600">موظف غير صالح</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            <ArrowRight className="h-4 w-4" />
            العودة للموظفين
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {employee?.name ?? "كشف حساب الموظف"}
          </h1>
          <p className="mt-1 text-slate-500">كشف حساب الموظف — الراتب والحركات</p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {isLoading || !employee ? (
        <p className="text-sm text-slate-500">جاري التحميل…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="الراتب الأساسي" value={formatEGP(employee.baseSalary)} />
            <StatCard
              label="صافي الراتب الحالي"
              value={formatEGP(employee.netSalary)}
              emphasize
            />
            <StatCard
              label="تاريخ التعيين"
              value={new Date(employee.hireDate).toLocaleDateString("ar-EG")}
            />
          </div>

          <form
            onSubmit={(e) => void saveProfile(e)}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
          >
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                تعديل الراتب الأساسي
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editSalary}
                onChange={(e) => setEditSalary(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                تاريخ التعيين
              </span>
              <input
                type="date"
                value={editHireDate}
                onChange={(e) => setEditHireDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {savingProfile ? "جاري الحفظ…" : "حفظ البيانات"}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              icon={<Wallet className="h-4 w-4" />}
              label="سلفة"
              onClick={() => setModalKind("ADVANCE")}
            />
            <ActionButton
              icon={<Banknote className="h-4 w-4" />}
              label="صرف راتب"
              onClick={() => setModalKind("SALARY_PAYMENT")}
            />
            <ActionButton
              icon={<Gift className="h-4 w-4" />}
              label="مكافأة"
              onClick={() => setModalKind("BONUS")}
            />
            <ActionButton
              icon={<MinusCircle className="h-4 w-4" />}
              label="خصم"
              onClick={() => setModalKind("DEDUCTION")}
            />
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              سجل الحركات ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400">
                لا توجد حركات بعد. سجّل سلفة أو مكافأة أو خصم أو صرف راتب.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold">التاريخ</th>
                      <th className="px-4 py-3 text-right font-semibold">النوع</th>
                      <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
                      <th className="px-4 py-3 text-right font-semibold">أيام</th>
                      <th className="px-4 py-3 text-right font-semibold">من الخزينة</th>
                      <th className="px-4 py-3 text-right font-semibold">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(row.date).toLocaleDateString("ar-EG")}
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={row.type} label={row.typeLabel} />
                        </td>
                        <td
                          className={`px-4 py-3 tabular-nums font-semibold ${
                            row.type === "BONUS"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {row.type === "BONUS" ? "+" : "−"}
                          {formatEGP(row.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {row.daysDeducted != null ? row.daysDeducted : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {row.paidFromSafe ? "نعم" : "لا"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {row.note ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {modalKind && (
            <HrTransactionModal
              open
              kind={modalKind}
              employeeId={employee.id}
              employeeName={employee.name}
              baseSalary={employee.baseSalary}
              onClose={() => setModalKind(null)}
              onSaved={() => void load()}
            />
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        emphasize
          ? "border-brand-200 bg-brand-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          emphasize ? "text-brand-800" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}

function TypeBadge({ type, label }: { type: string; label: string }) {
  const colors: Record<string, string> = {
    ADVANCE: "bg-amber-50 text-amber-800",
    DEDUCTION: "bg-rose-50 text-rose-800",
    BONUS: "bg-emerald-50 text-emerald-800",
    SALARY_PAYMENT: "bg-sky-50 text-sky-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        colors[type] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}

function toDateInput(iso: string) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}
