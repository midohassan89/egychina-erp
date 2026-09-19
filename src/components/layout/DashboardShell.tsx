"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingBag,
  Tags,
  Truck,
  Wallet,
  LogOut,
  BarChart3,
  History,
  Users,
  UserCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { signOut } from "next-auth/react";
import {
  canUsePos,
  navKeysForRole,
  type NavAccess,
} from "@/lib/auth/roles";

const NAV_ITEMS: {
  key: NavAccess;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { key: "overview", href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { key: "products", href: "/dashboard/products", label: "Products", icon: Tags },
  { key: "suppliers", href: "/dashboard/suppliers", label: "Suppliers", icon: Truck },
  { key: "purchases", href: "/dashboard/purchases", label: "Purchases", icon: ShoppingBag },
  { key: "sales", href: "/dashboard/sales", label: "Sales", icon: History },
  { key: "inventory", href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { key: "expenses", href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { key: "treasury", href: "/dashboard/treasury", label: "Treasury", icon: Wallet },
  { key: "reports", href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { key: "users", href: "/dashboard/users", label: "Users & Roles", icon: Users },
  { key: "profile", href: "/dashboard/profile", label: "My Profile", icon: UserCircle },
];

export function DashboardShell({
  children,
  username,
  role,
}: {
  children: React.ReactNode;
  username: string;
  role: string;
}) {
  const pathname = usePathname();
  const allowed = new Set(navKeysForRole(role));
  const nav = NAV_ITEMS.filter((item) => allowed.has(item.key));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="dashboard-no-print flex w-64 flex-col bg-slate-900 text-slate-200">
        <div className="border-b border-slate-700 px-5 py-5">
          <p className="text-sm font-semibold text-white">Souq El Obour ERP</p>
          <p className="mt-1 text-xs text-slate-400">
            {username} · {role}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map(({ key, href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 leading-tight">
                  {label}
                  {key === "users" && (
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                      المستخدمين والصلاحيات
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-slate-700 p-3">
          {canUsePos(role) && (
            <Link
              href="/pos"
              className="block rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              Open POS terminal
            </Link>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 print:p-0">{children}</main>
    </div>
  );
}
