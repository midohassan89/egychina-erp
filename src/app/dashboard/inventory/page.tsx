import Link from "next/link";
import { ClipboardList, Package, Printer, ScanLine } from "lucide-react";

const tools = [
  {
    href: "/dashboard/inventory/adjustments",
    title: "Inventory Adjustments",
    description:
      "الهالك · عجز جرد · استخدام للتصنيع · جرد يدوي — sync stock to WooCommerce",
    icon: ClipboardList,
  },
  {
    href: "/dashboard/inventory/stock-take",
    title: "Physical Stock Take",
    description:
      "جرد فعلي — count on-hand stock, auto-adjust variances, sync online",
    icon: ScanLine,
  },
  {
    href: "/dashboard/inventory/print-labels",
    title: "Print Barcode Labels",
    description:
      "طباعة باركود — thermal labels for ايجي شاينا ماركت (Xprinter)",
    icon: Printer,
  },
  {
    href: "/dashboard/products",
    title: "Product stock levels",
    description: "Browse and edit quantities from the Products catalog",
    icon: Package,
  },
];

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
        <p className="mt-1 text-slate-500">
          Stock reconciliation, wastage, production use, and label printing
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
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
