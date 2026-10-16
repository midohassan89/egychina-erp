"use client";

import { use, useEffect, useState } from "react";
import {
  PurchaseForm,
  type PurchaseInvoiceInitial,
} from "@/components/purchases/PurchaseForm";

export default function EditPurchaseInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const invoiceId = Number(idParam);
  const [invoice, setInvoice] = useState<PurchaseInvoiceInitial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      setError("رقم الفاتورة غير صالح");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/purchases/${invoiceId}`);
        const body = (await res.json()) as {
          error?: string;
          invoice?: PurchaseInvoiceInitial;
        };
        if (!res.ok || !body.invoice) {
          throw new Error(body.error ?? "تعذر تحميل الفاتورة");
        }
        if (!cancelled) setInvoice(body.invoice);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "تعذر تحميل الفاتورة");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">
        جاري تحميل الفاتورة…
      </p>
    );
  }

  if (error || !invoice) {
    return (
      <p className="py-12 text-center text-sm text-red-700 dark:text-red-300">
        {error ?? "تعذر تحميل الفاتورة"}
      </p>
    );
  }

  return <PurchaseForm initialData={invoice} />;
}
