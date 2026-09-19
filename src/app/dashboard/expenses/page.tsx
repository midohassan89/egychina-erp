"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface Category {
  id: number;
  name: string;
}

interface ExpenseRow {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  date: string;
  notes: string | null;
  paymentSource?: string;
}

interface BankRow {
  id: number;
  name: string;
  code: string;
  balance: number;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catName, setCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  /** "TREASURY" or bank account id as string */
  const [paymentSource, setPaymentSource] = useState("TREASURY");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [expRes, bankRes] = await Promise.all([
        fetch("/api/expenses"),
        fetch("/api/bank-accounts"),
      ]);
      const body = (await expRes.json()) as {
        error?: string;
        expenses?: ExpenseRow[];
        categories?: Category[];
      };
      if (!expRes.ok) throw new Error(body.error ?? "Failed to load expenses");
      setExpenses(body.expenses ?? []);
      setCategories(body.categories ?? []);

      if (bankRes.ok) {
        const banks = (await bankRes.json()) as { bankAccounts?: BankRow[] };
        setBankAccounts(banks.bankAccounts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setCatSaving(true);
    setCatError(null);
    try {
      const res = await fetch("/api/expenses/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not create category");
      setCatName("");
      await load();
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCatSaving(false);
    }
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const isBank = paymentSource !== "TREASURY";
      const res = await fetch("/api/expenses/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          amount: Number(amount),
          date,
          notes: notes.trim() || null,
          sourceType: isBank ? "BANK" : "TREASURY",
          bankAccountId: isBank ? Number(paymentSource) : null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save expense");
      setExpenseOpen(false);
      setCategoryId("");
      setAmount("");
      setNotes("");
      setPaymentSource("TREASURY");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="mt-1 text-slate-500">
            Categories and expense logging — debit Cash Safe or a bank account
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setPaymentSource("TREASURY");
            setExpenseOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Log Expense
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-800">
            Expense categories
          </h2>
          <form
            onSubmit={(e) => void handleAddCategory(e)}
            className="mt-3 flex gap-2"
          >
            <input
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Salaries"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              disabled={catSaving}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              Add
            </button>
          </form>
          {catError && (
            <p className="mt-2 text-xs text-red-700">{catError}</p>
          )}
          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto">
            {categories.length === 0 ? (
              <li className="text-sm text-slate-400">No categories yet</li>
            ) : (
              categories.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
                >
                  {c.name}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Recent expenses
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      No expenses logged yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {e.categoryName}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-red-700">
                        −{formatEGP(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {e.paymentSource ?? "Cash Safe"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {e.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {expenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Log Expense
              </h2>
              <button
                type="button"
                onClick={() => setExpenseOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => void handleCreateExpense(e)}
              className="space-y-4 px-5 py-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </span>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Amount (EGP)
                </span>
                <input
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Payment Source
                </span>
                <select
                  required
                  value={paymentSource}
                  onChange={(e) => setPaymentSource(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="TREASURY">Cash Safe (Treasury)</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} ({formatEGP(b.balance)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Date
                </span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Optional"
                />
              </label>
              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setExpenseOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  {saving ? "Saving…" : "Save & Debit Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
