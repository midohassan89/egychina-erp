"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";

function NewPurchaseInvoicePageInner() {
  const searchParams = useSearchParams();
  return <PurchaseForm prefillProductId={searchParams.get("productId")} />;
}

export default function NewPurchaseInvoicePage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-slate-500 dark:text-gray-400">جاري تحميل نموذج المشتريات…</p>
      }
    >
      <NewPurchaseInvoicePageInner />
    </Suspense>
  );
}
