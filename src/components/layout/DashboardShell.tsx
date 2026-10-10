"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingBag,
  Tags,
  FolderTree,
  Truck,
  Wallet,
  LogOut,
  BarChart3,
  History,
  Users,
  IdCard,
  UserCircle,
  PanelRightClose,
  PanelRightOpen,
  ClipboardList,
  ShieldAlert,
  ShoppingCart,
  MapPin,
  Images,
  Languages,
  Award,
  ChevronDown,
  Home,
  Warehouse,
  PieChart,
  Shield,
  Settings,
  Monitor,
  Search,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { signOut } from "next-auth/react";
import {
  canUsePos,
  navKeysForRole,
  type NavAccess,
} from "@/lib/auth/roles";

type NavLink = {
  key: NavAccess | "pos" | "signOut";
  href?: string;
  label: string;
  icon: LucideIcon;
  /** Solid CTA style (POS). */
  emphasize?: boolean;
  action?: "signOut";
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "الرئيسية",
    icon: Home,
    items: [
      {
        key: "overview",
        href: "/dashboard",
        label: "نظرة عامة",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "catalog",
    label: "الكتالوج والمنتجات",
    icon: Package,
    items: [
      { key: "products", href: "/dashboard/products", label: "المنتجات", icon: Tags },
      {
        key: "categories",
        href: "/dashboard/categories",
        label: "الأقسام",
        icon: FolderTree,
      },
      { key: "brands", href: "/admin/brands", label: "العلامات التجارية", icon: Award },
      {
        key: "autoImages",
        href: "/admin/auto-images",
        label: "أداة جلب الصور",
        icon: Images,
      },
      {
        key: "autoTranslate",
        href: "/admin/auto-translate",
        label: "أداة الترجمة الآلية",
        icon: Languages,
      },
    ],
  },
  {
    id: "warehouse",
    label: "المخازن والموردين",
    icon: Warehouse,
    items: [
      {
        key: "inventory",
        href: "/dashboard/inventory",
        label: "المخزون",
        icon: Package,
      },
      {
        key: "purchases",
        href: "/dashboard/purchases",
        label: "المشتريات",
        icon: ShoppingBag,
      },
      {
        key: "suppliers",
        href: "/dashboard/suppliers",
        label: "الموردين",
        icon: Truck,
      },
    ],
  },
  {
    id: "sales",
    label: "المبيعات",
    icon: ShoppingCart,
    items: [
      { key: "orders", href: "/admin/orders", label: "الطلبات", icon: ShoppingCart },
      {
        key: "deliveryZones",
        href: "/admin/delivery-zones",
        label: "مناطق التوصيل",
        icon: MapPin,
      },
      { key: "sales", href: "/dashboard/sales", label: "المبيعات", icon: History },
      {
        key: "pos",
        href: "/pos",
        label: "فتح نقطة البيع",
        icon: Monitor,
        emphasize: true,
      },
    ],
  },
  {
    id: "finance",
    label: "الحسابات والتقارير",
    icon: PieChart,
    items: [
      {
        key: "treasury",
        href: "/dashboard/treasury",
        label: "الخزينة",
        icon: Wallet,
      },
      {
        key: "expenses",
        href: "/dashboard/expenses",
        label: "المصروفات",
        icon: Receipt,
      },
      {
        key: "fleet",
        href: "/dashboard/fleet",
        label: "أسطول السائقين",
        icon: Truck,
      },
      {
        key: "reports",
        href: "/dashboard/reports",
        label: "التقارير",
        icon: BarChart3,
      },
      {
        key: "shifts",
        href: "/dashboard/shifts",
        label: "تقارير الورديات",
        icon: ClipboardList,
      },
      {
        key: "audit",
        href: "/dashboard/audit",
        label: "مراجعة المبيعات",
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: "admin",
    label: "الإدارة والموظفين",
    icon: Shield,
    items: [
      {
        key: "employees",
        href: "/dashboard/employees",
        label: "الموظفين والرواتب",
        icon: IdCard,
      },
      {
        key: "customers",
        href: "/dashboard/customers",
        label: "العملاء ونقاط الولاء",
        icon: Award,
      },
      {
        key: "users",
        href: "/dashboard/users",
        label: "المستخدمين والصلاحيات",
        icon: Users,
      },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    icon: Settings,
    items: [
      {
        key: "settings",
        href: "/dashboard/settings",
        label: "الإعدادات",
        icon: Settings,
      },
      {
        key: "profile",
        href: "/dashboard/profile",
        label: "ملفي الشخصي",
        icon: UserCircle,
      },
      {
        key: "signOut",
        label: "تسجيل الخروج",
        icon: LogOut,
        action: "signOut",
      },
    ],
  },
];

function isLinkActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function linkAllowed(
  key: NavLink["key"],
  allowed: Set<NavAccess>,
  role: string,
) {
  if (key === "pos") return canUsePos(role);
  if (key === "signOut") return true;
  return allowed.has(key);
}

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
  const allowed = useMemo(() => new Set(navKeysForRole(role)), [role]);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          linkAllowed(item.key, allowed, role),
        ),
      })).filter((group) => group.items.length > 0),
    [allowed, role],
  );

  const activeGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (
        group.items.some(
          (item) => item.href && isLinkActive(pathname, item.href),
        )
      ) {
        ids.add(group.id);
      }
    }
    if (ids.size === 0 && groups[0]) ids.add(groups[0].id);
    return ids;
  }, [groups, pathname]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(activeGroupIds);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setExpanded(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const id of activeGroupIds) next.add(id);
      return next;
    });
  }, [activeGroupIds]);

  const showLabels = expanded;

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      dir="rtl"
      className="flex h-screen overflow-hidden bg-slate-100"
    >
      <aside
        className={clsx(
          "dashboard-no-print flex shrink-0 flex-col border-s border-slate-800 bg-slate-900 text-slate-300",
          "transition-all duration-300 ease-in-out",
          showLabels ? "w-72" : "w-16",
        )}
      >
        <div
          className={clsx(
            "flex items-start gap-2 border-b border-slate-800 py-4",
            showLabels ? "px-3" : "justify-center px-2",
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label={showLabels ? "طي القائمة" : "توسيع القائمة"}
            title={showLabels ? "طي" : "توسيع"}
          >
            {showLabels ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </button>
          <div
            className={clsx(
              "min-w-0 overflow-hidden transition-all duration-300",
              showLabels ? "max-w-[14rem] opacity-100" : "max-w-0 opacity-0",
            )}
          >
            <p className="truncate text-sm font-bold whitespace-nowrap text-white">
              سوق العبور — نظام الإدارة
            </p>
            <p className="mt-1 truncate text-xs whitespace-nowrap text-slate-400">
              {username} · {role}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = openGroups.has(group.id);
            const groupActive = group.items.some(
              (item) => item.href && isLinkActive(pathname, item.href),
            );

            return (
              <div key={group.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!showLabels) {
                      setExpanded(true);
                      setOpenGroups(new Set([group.id]));
                      return;
                    }
                    toggleGroup(group.id);
                  }}
                  title={group.label}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-lg py-2.5 text-sm font-semibold transition-colors",
                    showLabels ? "gap-2 px-2.5" : "justify-center px-2",
                    groupActive
                      ? "bg-slate-800/80 text-orange-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <GroupIcon className="h-5 w-5 shrink-0" />
                    {showLabels && (
                      <span className="truncate">{group.label}</span>
                    )}
                  </span>
                  {showLabels && (
                    <ChevronDown
                      className={clsx(
                        "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                        isOpen ? "rotate-0" : "rotate-90",
                      )}
                    />
                  )}
                </button>

                {showLabels && isOpen && (
                  <div className="ms-2 space-y-0.5 border-s border-slate-800 pe-0 ps-2">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active =
                        !!item.href && isLinkActive(pathname, item.href);

                      if (item.action === "signOut") {
                        return (
                          <button
                            key={item.key}
                            type="button"
                            title={item.label}
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/50 hover:text-red-200"
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      }

                      if (!item.href) return null;

                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          title={item.label}
                          className={clsx(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                            item.emphasize
                              ? active
                                ? "bg-orange-600 text-white shadow-sm shadow-orange-900/40"
                                : "bg-orange-600/90 text-white hover:bg-orange-500"
                              : active
                                ? "bg-orange-600 text-white"
                                : "text-slate-300 hover:bg-slate-800 hover:text-white",
                          )}
                        >
                          <ItemIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {!showLabels &&
                  group.items.map((item) => {
                    if (!item.href || item.action === "signOut") return null;
                    const ItemIcon = item.icon;
                    const active = isLinkActive(pathname, item.href);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        title={item.label}
                        className={clsx(
                          "flex items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                          item.emphasize
                            ? "bg-orange-600 text-white"
                            : active
                              ? "bg-orange-600 text-white"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white",
                        )}
                      >
                        <ItemIcon className="h-5 w-5 shrink-0" />
                      </Link>
                    );
                  })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-no-print flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              مرحباً، {username}
            </p>
            <p className="truncate text-xs text-slate-500">{role}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                readOnly
                tabIndex={-1}
                placeholder="البحث..."
                className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-2 pe-3 ps-9 text-sm text-slate-600 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:bg-white lg:w-64"
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="الإشعارات"
            >
              <Bell className="h-4 w-4" />
              الإشعارات
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 transition-all duration-300 sm:p-6 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
