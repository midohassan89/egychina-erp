"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  ProductForm,
  productFormToCreateFormData,
  type ProductFormValues,
} from "@/components/products/ProductForm";
import { ToastProvider, useToast } from "@/components/ui/Toast";

export default function NewProductPage() {
  return (
    <ToastProvider>
      <NewProductForm />
    </ToastProvider>
  );
}

function NewProductForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(values: ProductFormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/products/create", {
        method: "POST",
        body: productFormToCreateFormData(values),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "تعذر إنشاء المنتج");
      }
      toast("تم إنشاء المنتج", "success");
      router.push("/dashboard/products");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إنشاء المنتج";
      toast(message, "error");
      setSubmitting(false);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">منتج جديد</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            يُحفظ في قاعدة بيانات النظام
          </p>
        </div>
      </div>

      <ProductForm
        onSubmit={handleSubmit}
        isLoading={submitting}
        cancelHref="/dashboard/products"
        submitLabel="إنشاء المنتج"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      />
    </div>
  );
}
