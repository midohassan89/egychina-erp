"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ArrowDownToLine, ArrowLeftRight, Plus, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";
import { ToastProvider, useToast } from "@/components/ui/Toast";

interface TxRow {
  id: number;
  type: string;
  amount: number;
  description: string;
  reference: string | null;
  date: string;
}

interface BankRow {
  id: number;
  name: string;
  code: string;
  balance: number;
}

type TransferSide = "TREASURY" | `BANK:${number}`;

export default function TreasuryPage() {
  return (
    <ToastProvider>
      <TreasuryPageInner />
    </ToastProvider>
  );
}

function TreasuryPageInner() {
  const { toast } = useToast();
  const [balance, setBalance] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [fromSide, setFromSide] = useState<TransferSide>("TREASURY");
  const [toSide, setToSide] = useState<TransferSide>("BANK:0");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/treasury");
      const body = (await res.json()) as {
        error?: string;
        treasury?: { balance: number; updatedAt: string };
        transactions?: TxRow[];
        bankAccounts?: BankRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load treasury");
      setBalance(body.treasury?.balance ?? 0);
      setUpdatedAt(body.treasury?.updatedAt ?? null);
      setTransactions(body.transactions ?? []);
      const banks = body.bankAccounts ?? [];
      setBankAccounts(banks);
      if (banks.length > 0) {
        setToSide((prev) =>
          prev.startsWith("BANK:") && prev !== "BANK:0"
            ? prev
            : (`BANK:${banks[0].id}` as TransferSide),
        );
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

  const transferOptions = useMemo(() => {
    const opts: { value: TransferSide; label: string; balance: number }[] = [
      {
        value: "TREASURY",
        label: "Main Treasury Cash",
        balance,
      },
      ...bankAccounts.map((b) => ({
        value: `BANK:${b.id}` as TransferSide,
        label: b.name,
        balance: b.balance,
      })),
    ];
    return opts;
  }, [balance, bankAccounts]);

  function resetForm() {
    setAmount("");
    setDescription("");
    setFormError(null);
  }

  function parseSide(side: TransferSide): {
    type: "TREASURY" | "BANK";
    accountId: number | null;
  } {
    if (side === "TREASURY") return { type: "TREASURY", accountId: null };
    const id = Number(side.replace("BANK:", ""));
    return { type: "BANK", accountId: id };
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/treasury/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          description: description.trim(),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        treasury?: { balance: number };
      };
      if (!res.ok) throw new Error(body.error ?? "Deposit failed");

      setDepositOpen(false);
      resetForm();
      toast(
        `Deposited ${formatEGP(Number(amount))} — new balance ${formatEGP(body.treasury?.balance ?? 0)}`,
        "success",
      );
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/treasury/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          description: description.trim(),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        treasury?: { balance: number };
      };
      if (!res.ok) throw new Error(body.error ?? "Withdrawal failed");

      setWithdrawOpen(false);
      resetForm();
      toast(
        `Withdrew ${formatEGP(Number(amount))} — new balance ${formatEGP(body.treasury?.balance ?? 0)}`,
        "success",
      );
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const from = parseSide(fromSide);
      const to = parseSide(toSide);
      const res = await fetch("/api/treasury/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromType: from.type,
          fromAccountId: from.accountId,
          toType: to.type,
          toAccountId: to.accountId,
          amount: Number(amount),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        transfer?: { fromLabel?: string; toLabel?: string; amount: number };
      };
      if (!res.ok) throw new Error(body.error ?? "Transfer failed");

      setTransferOpen(false);
      resetForm();
      toast(
        `Transferred ${formatEGP(body.transfer?.amount ?? Number(amount))} · ${body.transfer?.fromLabel ?? "source"} → ${body.transfer?.toLabel ?? "dest"}`,
        "success",
      );
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treasury</h1>
          <p className="mt-1 text-slate-500">
            Cash safe, digital bank balances, and fund transfers
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFromSide("TREASURY");
              if (bankAccounts[0]) {
                setToSide(`BANK:${bankAccounts[0].id}`);
              }
              setTransferOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
          >
            <ArrowLeftRight className="h-4 w-4" />
            تحويل داخلي · Internal Transfer
          </button>
          <Link
            href="/dashboard/expenses"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Manage Expenses
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-8 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Current Treasury Balance (Cash)
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
              {isLoading ? "…" : formatEGP(balance)}
            </p>
            {updatedAt && (
              <p className="mt-3 text-xs text-slate-500">
                Updated {new Date(updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setDescription("Starting Capital");
                setDepositOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              إيداع رصيد · Add Funds
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setDescription("Owner withdrawal");
                setWithdrawOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-orange-400 bg-transparent px-4 py-2.5 text-sm font-semibold text-orange-300 hover:bg-orange-500/15 hover:text-orange-200"
            >
              <ArrowDownToLine className="h-4 w-4" />
              سحب رصيد · Withdraw Funds
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Bank Accounts
          </h2>
          <p className="text-xs text-slate-500">
            Digital channels — filled automatically when a POS shift closes
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : bankAccounts.length === 0 ? (
            <p className="text-sm text-slate-400">
              No bank accounts — run db:seed
            </p>
          ) : (
            bankAccounts.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {b.code}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {b.name}
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                  {formatEGP(b.balance)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Cash ledger (Treasury)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Reference</th>
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
              ) : transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No treasury movements yet. Use Add Funds to inject starting
                    capital.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const isIn = t.type === "IN";
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(t.date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset",
                            isIn
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                              : "bg-red-50 text-red-800 ring-red-200",
                          )}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 text-right font-semibold tabular-nums",
                          isIn ? "text-emerald-700" : "text-red-700",
                        )}
                      >
                        {isIn ? "+" : "−"}
                        {formatEGP(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {t.description}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">
                        {t.reference || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {depositOpen && (
        <ModalShell
          title="إيداع رصيد · Add Funds"
          subtitle="Manual deposit into the master safe"
          onClose={() => setDepositOpen(false)}
        >
          <form
            onSubmit={(e) => void handleDeposit(e)}
            className="space-y-4 px-5 py-4"
          >
            <AmountField
              value={amount}
              onChange={setAmount}
              focusClass="focus:border-emerald-500 focus:ring-emerald-500/20"
            />
            <DescField
              value={description}
              onChange={setDescription}
              placeholder="e.g. Starting Capital or Owner Injection"
              focusClass="focus:border-emerald-500 focus:ring-emerald-500/20"
            />
            {formError && <FormError message={formError} />}
            <FormActions
              onCancel={() => setDepositOpen(false)}
              saving={isSaving}
              saveLabel="Confirm Deposit"
              savingLabel="Depositing…"
              saveClass="bg-emerald-600 hover:bg-emerald-700"
            />
          </form>
        </ModalShell>
      )}

      {withdrawOpen && (
        <ModalShell
          title="سحب رصيد · Withdraw Funds"
          subtitle="Owner withdrawal (not an expense)"
          onClose={() => setWithdrawOpen(false)}
        >
          <form
            onSubmit={(e) => void handleWithdraw(e)}
            className="space-y-4 px-5 py-4"
          >
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Available balance:{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {formatEGP(balance)}
              </span>
            </p>
            <AmountField
              value={amount}
              onChange={setAmount}
              max={balance}
              focusClass="focus:border-orange-500 focus:ring-orange-500/20"
            />
            <DescField
              value={description}
              onChange={setDescription}
              placeholder="e.g. Owner withdrawal"
              focusClass="focus:border-orange-500 focus:ring-orange-500/20"
            />
            {formError && <FormError message={formError} />}
            <FormActions
              onCancel={() => setWithdrawOpen(false)}
              saving={isSaving}
              saveLabel="Confirm Withdrawal"
              savingLabel="Withdrawing…"
              saveClass="bg-orange-600 hover:bg-orange-700"
            />
          </form>
        </ModalShell>
      )}

      {transferOpen && (
        <ModalShell
          title="تحويل داخلي · Internal Transfer"
          subtitle="Move funds between cash safe and bank accounts"
          onClose={() => setTransferOpen(false)}
        >
          <form
            onSubmit={(e) => void handleTransfer(e)}
            className="space-y-4 px-5 py-4"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                From
              </span>
              <select
                value={fromSide}
                onChange={(e) => setFromSide(e.target.value as TransferSide)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                {transferOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({formatEGP(o.balance)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                To
              </span>
              <select
                value={toSide}
                onChange={(e) => setToSide(e.target.value as TransferSide)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                {transferOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({formatEGP(o.balance)})
                  </option>
                ))}
              </select>
            </label>
            <AmountField
              value={amount}
              onChange={setAmount}
              focusClass="focus:border-sky-500 focus:ring-sky-500/20"
            />
            {formError && <FormError message={formError} />}
            <FormActions
              onCancel={() => setTransferOpen(false)}
              saving={isSaving}
              saveLabel="Confirm Transfer"
              savingLabel="Transferring…"
              saveClass="bg-sky-600 hover:bg-sky-700"
            />
          </form>
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AmountField({
  value,
  onChange,
  max,
  focusClass,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: number;
  focusClass: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        Amount (EGP)
      </span>
      <input
        required
        type="number"
        min={0.01}
        step="0.01"
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        className={clsx(
          "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold tabular-nums outline-none focus:ring-2",
          focusClass,
        )}
        placeholder="0.00"
      />
    </label>
  );
}

function DescField({
  value,
  onChange,
  placeholder,
  focusClass,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  focusClass: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        Description
      </span>
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2",
          focusClass,
        )}
        placeholder={placeholder}
      />
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

function FormActions({
  onCancel,
  saving,
  saveLabel,
  savingLabel,
  saveClass,
}: {
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  saveClass: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className={clsx(
          "flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:bg-slate-300",
          saveClass,
        )}
      >
        {saving ? savingLabel : saveLabel}
      </button>
    </div>
  );
}
