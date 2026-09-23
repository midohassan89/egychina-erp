import Link from "next/link";
import {
  Package,
  Receipt,
  ShoppingBag,
  Truck,
  Wallet,
  BarChart3,
  History,
  ClipboardList,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { auth } from "@/auth";
import { canManageUsers, isManagerOrAdmin } from "@/lib/auth/roles";

const cards = [
  {
    href: "/dashboard/suppliers",
    title: "Suppliers",
    description: "Vendor directory and balances",
    icon: Truck,
    usersOnly: false,
  },
  {
    href: "/dashboard/purchases",
    title: "Purchases",
    description: "Supplier invoices and stock receiving",
    icon: ShoppingBag,
    usersOnly: false,
  },
  {
    href: "/dashboard/sales",
    title: "Sales History",
    description: "POS receipts, refunds, and reprints",
    icon: History,
    usersOnly: false,
  },
  {
    href: "/dashboard/expenses",
    title: "Expenses",
    description: "Categories and expense logging",
    icon: Receipt,
    usersOnly: false,
  },
  {
    href: "/dashboard/treasury",
    title: "Treasury",
    description: "Safe balance and cash ledger",
    icon: Wallet,
    usersOnly: false,
  },
  {
    href: "/dashboard/shifts",
    title: "Shifts / Z-Reports",
    description: "سجل الورديات — register closes and Z-Reports",
    icon: ClipboardList,
    usersOnly: false,
  },
  {
    href: "/dashboard/inventory",
    title: "Inventory",
    description: "Stock levels and adjustments",
    icon: Package,
    usersOnly: false,
  },
  {
    href: "/dashboard/reports",
    title: "Reports",
    description: "P&L, bestsellers, and stock alerts",
    icon: BarChart3,
    usersOnly: false,
  },
  {
    href: "/dashboard/audit",
    title: "Sale Audit",
    description: "Orders flagged for review — stock gaps and missing shifts",
    icon: ShieldAlert,
    usersOnly: false,
    managersOnly: true,
  },
  {
    href: "/dashboard/users",
    title: "Users & Roles",
    description: "Manage staff accounts, roles, and PIN codes",
    icon: Shield,
    usersOnly: true,
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const showUsers = canManageUsers(session?.user?.role);
  const showAudit = isManagerOrAdmin(session?.user?.role);
  const visible = cards.filter((c) => {
    if ("usersOnly" in c && c.usersOnly && !showUsers) return false;
    if ("managersOnly" in c && c.managersOnly && !showAudit) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ERP Dashboard</h1>
        <p className="mt-1 text-slate-500">
          Accounting modules for Souq El Obour — separate from WooCommerce auth
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md"
          >
            <div className="mb-3 inline-flex rounded-lg bg-brand-600 p-2.5 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {href === "/dashboard/users" && (
              <p className="mt-0.5 text-xs text-slate-400">
                المستخدمين والصلاحيات
              </p>
            )}
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
