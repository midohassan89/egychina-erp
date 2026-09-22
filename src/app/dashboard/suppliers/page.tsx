"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Banknote, Pencil, Plus, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface SupplierRow {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  openingBalance: number;
  createdAt: string;
}

interface BankRow {
  id: number;
  name: string;
  code: string;
  balance: number;
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<SupplierRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [paySupplier, setPaySupplier] = useState<SupplierRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paySource, setPaySource] = useState("TREASURY");
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [supRes, bankRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/bank-accounts"),
      ]);
      const body = (await supRes.json()) as {
        error?: string;
        suppliers?: SupplierRow[];
      };
      if (!supRes.ok) throw new Error(body.error ?? "Failed to load suppliers");
      setSuppliers(body.suppliers ?? []);
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

  function openCreate() {
    setFormError(null);
    setName("");
    setPhone("");
    setOpeningBalance("0");
    setEditSupplier(null);
    setCreateOpen(true);
  }

  function openEdit(s: SupplierRow) {
    setFormError(null);
    setName(s.name);
    setPhone(s.phone ?? "");
    setOpeningBalance(String(s.openingBalance ?? 0));
    setCreateOpen(false);
    setEditSupplier(s);
  }

  function closeForm() {
    if (isSaving) return;
    setCreateOpen(false);
    setEditSupplier(null);
    setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const payload: {
        name: string;
        phone: string | null;
        openingBalance?: number;
      } = {
        name: name.trim(),
        phone: phone.trim() || null,
      };

      if (isAdmin) {
        const ob = Number(openingBalance);
        if (!Number.isFinite(ob) || ob < 0) {
          throw new Error("Opening balance must be ≥ 0");
        }
        payload.openingBalance = ob;
      }

      const res = editSupplier
        ? await fetch(`/api/suppliers/${editSupplier.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/suppliers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save supplier");
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!paySupplier) return;
    setIsPaying(true);
    setPayError(null);
    try {
      const isBank = paySource !== "TREASURY";
      const res = await fetch("/api/suppliers/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: paySupplier.id,
          amount: Number(payAmount),
          notes: payNotes.trim() || null,
          sourceType: isBank ? "BANK" : "TREASURY",
          bankAccountId: isBank ? Number(paySource) : null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Payment failed");
      setPaySupplier(null);
      setPayAmount("");
      setPayNotes("");
      setPaySource("TREASURY");
      await load();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }

  const formOpen = createOpen || editSupplier != null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="mt-1 text-slate-500">
            Vendor directory, accounts payable, and payment tracking
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Supplier
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Balance (A/P)</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No suppliers yet. Create one to start purchase invoices.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatEGP(s.openingBalance ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEGP(s.balance)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPayError(null);
                            setPayAmount("");
                            setPayNotes("");
                            setPaySupplier(s);
                            setPaySource("TREASURY");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          سداد دفعة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editSupplier ? "Edit Supplier" : "New Supplier"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => void handleSave(e)}
              className="space-y-4 px-5 py-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Name
                </span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Supplier name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Phone
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Optional"
                />
              </label>

              {isAdmin ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    الرصيد الافتتاحي · Opening Balance
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 text-sm font-semibold tabular-nums outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    placeholder="0.00"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Prior debt from the old system (مديونيات سابقة). Admin only.
                    Total owed = opening + purchases − payments.
                  </span>
                </label>
              ) : editSupplier && editSupplier.openingBalance > 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Opening balance:{" "}
                  <strong className="tabular-nums">
                    {formatEGP(editSupplier.openingBalance)}
                  </strong>{" "}
                  (Admin only to edit)
                </p>
              ) : null}

              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  {isSaving
                    ? "Saving…"
                    : editSupplier
                      ? "Save changes"
                      : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paySupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  سداد دفعة · Make Payment
                </h2>
                <p className="text-sm text-slate-500">
                  {paySupplier.name} · balance {formatEGP(paySupplier.balance)}
                  {paySupplier.openingBalance > 0
                    ? ` · opening ${formatEGP(paySupplier.openingBalance)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaySupplier(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => void handlePay(e)}
              className="space-y-4 px-5 py-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Amount (EGP)
                </span>
                <input
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="0.00"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Payment Source
                </span>
                <select
                  required
                  value={paySource}
                  onChange={(e) => setPaySource(e.target.value)}
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
                  Notes (optional)
                </span>
                <input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="e.g. Cash to driver"
                />
              </label>
              {payError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {payError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPaySupplier(null)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPaying}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {isPaying ? "Saving…" : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
