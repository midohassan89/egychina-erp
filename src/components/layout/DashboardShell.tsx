"use client";

import { useEffect, useState } from "react";
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
  IdCard,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardList,
  ShieldAlert,
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
  { key: "shifts", href: "/dashboard/shifts", label: "Shifts / Z-Reports", icon: ClipboardList },
  { key: "audit", href: "/dashboard/audit", label: "Sale Audit", icon: ShieldAlert },
  { key: "users", href: "/dashboard/users", label: "Users & Roles", icon: Users },
  { key: "employees", href: "/dashboard/employees", label: "Employees", icon: IdCard },
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

  /**
   * Mobile/tablet: start collapsed (icons only).
   * Desktop (lg+): start expanded. User can still toggle on any size.
   */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setExpanded(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const showLabels = expanded;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside
        className={clsx(
          "dashboard-no-print flex shrink-0 flex-col bg-slate-900 text-slate-200",
          "transition-all duration-300 ease-in-out",
          showLabels ? "w-64" : "w-16",
        )}
      >
        <div
          className={clsx(
            "flex items-start gap-2 border-b border-slate-700 py-4",
            showLabels ? "px-4" : "justify-center px-2",
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label={showLabels ? "Collapse sidebar" : "Expand sidebar"}
            title={showLabels ? "Collapse" : "Expand"}
          >
            {showLabels ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>
          <div
            className={clsx(
              "min-w-0 overflow-hidden transition-all duration-300",
              showLabels ? "max-w-[11rem] opacity-100" : "max-w-0 opacity-0",
            )}
          >
            <p className="truncate text-sm font-semibold whitespace-nowrap text-white">
              Souq El Obour ERP
            </p>
            <p className="mt-1 truncate text-xs whitespace-nowrap text-slate-400">
              {username} · {role}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {nav.map(({ key, href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={clsx(
                  "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                  showLabels ? "gap-3 px-3" : "justify-center px-2",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span
                  className={clsx(
                    "min-w-0 overflow-hidden leading-tight whitespace-nowrap transition-all duration-300",
                    showLabels
                      ? "max-w-[12rem] opacity-100"
                      : "max-w-0 opacity-0",
                  )}
                >
                  {label}
                  {key === "users" && showLabels && (
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                      المستخدمين والصلاحيات
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-slate-700 p-2">
          {canUsePos(role) && (
            <Link
              href="/pos"
              title="Open POS terminal"
              className={clsx(
                "flex items-center rounded-lg py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white",
                showLabels ? "gap-2 px-3" : "justify-center px-2",
              )}
            >
              <ShoppingBag className="h-4 w-4 shrink-0" />
              <span
                className={clsx(
                  "overflow-hidden whitespace-nowrap transition-all duration-300",
                  showLabels ? "max-w-[10rem] opacity-100" : "max-w-0 opacity-0",
                )}
              >
                Open POS terminal
              </span>
            </Link>
          )}
          <button
            type="button"
            title="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={clsx(
              "flex w-full items-center rounded-lg py-2 text-sm text-red-300 hover:bg-slate-800",
              showLabels ? "gap-2 px-3" : "justify-center px-2",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span
              className={clsx(
                "overflow-hidden whitespace-nowrap transition-all duration-300",
                showLabels ? "max-w-[10rem] opacity-100" : "max-w-0 opacity-0",
              )}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* flex-1 main shrinks/grows as sidebar width animates — no fixed margin needed */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 transition-all duration-300 sm:p-6 print:p-0">
        {children}
      </main>
    </div>
  );
}
