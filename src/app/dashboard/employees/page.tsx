"use client";

import { useCallback, useEffect, useState } from "react";

interface EmployeeRow {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not add employee");
      setName("");
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
      setEmployees((prev) =>
        prev.map((row) => (row.id === employee.id ? { ...row, isActive } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update employee");
    }
  }

  const active = employees.filter((employee) => employee.isActive);
  const inactive = employees.filter((employee) => !employee.isActive);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
        <p className="mt-1 text-slate-500">
          Staff who can be selected for a وجبات عمال / Staff Meal. These are not
          login accounts.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Add new employee
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Employee name"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
        >
          {isSaving ? "Saving…" : "Add"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          Active ({active.length})
        </h2>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>
        ) : active.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400">No active employees yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {active.map((employee) => (
              <li
                key={employee.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <span className="font-medium text-slate-900">{employee.name}</span>
                <button
                  type="button"
                  onClick={() => void setActive(employee, false)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  Deactivate
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-500">
            Inactive ({inactive.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {inactive.map((employee) => (
              <li
                key={employee.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <span className="text-slate-500">{employee.name}</span>
                <button
                  type="button"
                  onClick={() => void setActive(employee, true)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Activate
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
