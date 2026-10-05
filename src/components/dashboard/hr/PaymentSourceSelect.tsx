"use client";

import { useEffect, useState } from "react";

export type PaymentSourceValue = {
  sourceType: "TREASURY" | "BANK";
  bankAccountId: number | null;
};

interface BankAccount {
  id: number;
  name: string;
  balance: number;
}

interface PaymentSourceSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

/** Dropdown: الخزينة + bank accounts. Value "TREASURY" or bank id string. */
export function PaymentSourceSelect({
  value,
  onChange,
  disabled,
  required,
}: PaymentSourceSelectProps) {
  const [banks, setBanks] = useState<BankAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/bank-accounts");
        const body = (await res.json()) as { bankAccounts?: BankAccount[] };
        if (!cancelled) setBanks(body.bankAccounts ?? []);
      } catch {
        if (!cancelled) setBanks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        الخزينة / مصدر الدفع
      </span>
      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
      >
        <option value="TREASURY">الخزينة (نقدي)</option>
        {banks.map((b) => (
          <option key={b.id} value={String(b.id)}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function parseSourceValue(value: string): PaymentSourceValue {
  if (value === "TREASURY" || !value) {
    return { sourceType: "TREASURY", bankAccountId: null };
  }
  return { sourceType: "BANK", bankAccountId: Number(value) };
}
