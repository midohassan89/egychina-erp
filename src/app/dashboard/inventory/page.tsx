import Link from "next/link";
import { ClipboardList, Package, Printer, Scale, ScanLine } from "lucide-react";

const tools = [
  {
    href: "/dashboard/inventory/opening-balance",
    title: "أرصدة أول المدة",
    description: "إدخال أرصدة الكراتين والقطع وتكلفة القطعة",
    icon: Scale,
  },
  {
    href: "/dashboard/inventory/adjustments",
    title: "تسويات المخزون",
    description:
      "الهالك · عجز جرد · استخدام للتصنيع · جرد يدوي — مزامنة مع المتجر",
    icon: ClipboardList,
  },
  {
    href: "/dashboard/inventory/stock-take",
    title: "جرد فعلي",
    description: "عد المخزون الفعلي وتسوية الفروقات تلقائياً",
    icon: ScanLine,
  },
  {
    href: "/dashboard/inventory/print-labels",
    title: "طباعة ملصقات الباركود",
    description: "طباعة ملصقات حرارية لإيجي شاينا ماركت",
    icon: Printer,
  },
  {
    href: "/dashboard/products",
    title: "أرصدة المنتجات",
    description: "عرض وتعديل كميات المنتجات من الكتالوج",
    icon: Package,
  },
];

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div className="text-right">
        <h1 className="text-2xl font-bold text-slate-900">المخزون</h1>
        <p className="mt-1 text-slate-500">
          تسوية المخزون والهالك والتصنيع وطباعة الملصقات
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 text-right shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 group-hover:bg-brand-100">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
