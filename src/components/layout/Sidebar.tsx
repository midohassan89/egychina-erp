"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderTree,
  History,
  ImageDown,
  Languages,
  LayoutDashboard,
  LogOut,
  Bell,
  MapPin,
  MessageCircle,
  Package,
  PackagePlus,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  Receipt,
  RotateCcw,
  ScanBarcode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Ticket,
  Truck,
  Undo2,
  User,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  X,
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
  key: NavAccess | "priceChecker";
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches the existing admin-only gate on /dashboard/users/logs. */
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

const OVERVIEW: NavLink = {
  key: "overview",
  href: "/dashboard",
  label: "لوحة المؤشرات العامة",
  icon: LayoutDashboard,
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "pos",
    label: "الكاشير ونقاط البيع",
    icon: ShoppingCart,
    items: [
      {
        key: "sales",
        href: "/dashboard/sales",
        label: "فواتير مبيعات الكاشير",
        icon: Receipt,
      },
      {
        key: "shifts",
        href: "/dashboard/shifts",
        label: "الورديات وتقارير Z",
        icon: ClipboardList,
      },
      {
        key: "audit",
        href: "/dashboard/audit",
        label: "مراجعة وتدقيق الكاشير",
        icon: ShieldCheck,
      },
      {
        key: "priceChecker",
        href: "/price-checker",
        label: "شاشة فاحص الأسعار",
        icon: ScanBarcode,
      },
    ],
  },
  {
    id: "store",
    label: "المتجر الإلكتروني والتوصيل",
    icon: ShoppingBag,
    items: [
      {
        key: "orders",
        href: "/admin/orders",
        label: "طلبات المتجر والتطبيق",
        icon: ShoppingBag,
      },
      {
        key: "returns",
        href: "/dashboard/returns",
        label: "مرتجعات العملاء",
        icon: RotateCcw,
      },
      {
        key: "customers",
        href: "/dashboard/customers",
        label: "العملاء ونقاط الولاء",
        icon: Users,
      },
      {
        key: "fleet",
        href: "/dashboard/fleet",
        label: "أسطول السائقين ومصاريفهم",
        icon: Truck,
      },
      {
        key: "deliveryZones",
        href: "/admin/delivery-zones",
        label: "مناطق وأسعار التوصيل",
        icon: MapPin,
      },
      {
        key: "coupons",
        href: "/dashboard/coupons",
        label: "أكواد الخصم",
        icon: Ticket,
      },
      {
        key: "notifications",
        href: "/dashboard/notifications",
        label: "إشعارات العملاء",
        icon: Bell,
      },
      {
        key: "chat",
        href: "/dashboard/chat",
        label: "محادثات العملاء",
        icon: MessageCircle,
      },
    ],
  },
  {
    id: "catalog",
    label: "الكتالوج والتسعير",
    icon: Package,
    items: [
      {
        key: "products",
        href: "/dashboard/products",
        label: "دليل الأصناف والمنتجات",
        icon: Package,
      },
      {
        key: "categories",
        href: "/dashboard/categories",
        label: "الأقسام والتصنيفات",
        icon: FolderTree,
      },
      {
        key: "brands",
        href: "/admin/brands",
        label: "العلامات التجارية",
        icon: Tag,
      },
      {
        key: "inventory",
        href: "/dashboard/inventory/print-labels",
        label: "طباعة ملصقات الباركود",
        icon: Printer,
      },
    ],
  },
  {
    id: "warehouse",
    label: "المخازن والمشتريات",
    icon: Warehouse,
    items: [
      {
        key: "inventory",
        href: "/dashboard/inventory",
        label: "أرصدة وحركة المخزون",
        icon: Warehouse,
      },
      {
        key: "inventory",
        href: "/dashboard/inventory/stock-take",
        label: "الجرد الفعلي للمخزن",
        icon: ClipboardCheck,
      },
      {
        key: "inventory",
        href: "/dashboard/inventory/adjustments",
        label: "التسويات المخزنية والهالك",
        icon: SlidersHorizontal,
      },
      {
        key: "inventory",
        href: "/dashboard/inventory/opening-balance",
        label: "الأرصدة الافتتاحية",
        icon: PackagePlus,
      },
      {
        key: "purchases",
        href: "/dashboard/purchases",
        label: "فواتير المشتريات",
        icon: ShoppingBag,
      },
      {
        key: "purchases",
        href: "/dashboard/purchases/returns",
        label: "مرتجعات المشتريات",
        icon: Undo2,
      },
      {
        key: "suppliers",
        href: "/dashboard/suppliers",
        label: "سجل وحسابات الموردين",
        icon: Building2,
      },
    ],
  },
  {
    id: "finance",
    label: "المالية والحسابات",
    icon: Wallet,
    items: [
      {
        key: "treasury",
        href: "/dashboard/treasury",
        label: "الخزينة والحسابات البنكية",
        icon: Wallet,
      },
      {
        key: "expenses",
        href: "/dashboard/expenses",
        label: "المصروفات التشغيلية",
        icon: Receipt,
      },
      {
        key: "reports",
        href: "/dashboard/reports/supplier-statement",
        label: "كشف حساب مورد",
        icon: FileText,
      },
      {
        key: "reports",
        href: "/dashboard/reports",
        label: "التقارير المالية والأرباح",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية والرقابة",
    icon: UserCheck,
    items: [
      {
        key: "employees",
        href: "/dashboard/employees",
        label: "شؤون الموظفين والرواتب",
        icon: UserCheck,
      },
      {
        key: "users",
        href: "/dashboard/users",
        label: "المستخدمين والصلاحيات",
        icon: UserCog,
      },
      {
        key: "users",
        href: "/dashboard/users/logs",
        label: "سجل الرقابة والعمليات",
        icon: History,
        adminOnly: true,
      },
    ],
  },
  {
    id: "system",
    label: "الإعدادات وأدوات النظام",
    icon: Settings,
    items: [
      {
        key: "settings",
        href: "/dashboard/settings",
        label: "إعدادات النظام والمتجر",
        icon: Settings,
      },
      {
        key: "autoImages",
        href: "/dashboard/tools/auto-fetch",
        label: "أداة جلب الصور الذكية",
        icon: ImageDown,
      },
      {
        key: "autoTranslate",
        href: "/admin/auto-translate",
        label: "أداة الترجمة الآلية",
        icon: Languages,
      },
      {
        key: "profile",
        href: "/dashboard/profile",
        label: "ملفي الشخصي",
        icon: User,
      },
    ],
  },
];

function linkAllowed(key: NavLink["key"], allowed: Set<NavAccess>) {
  if (key === "priceChecker") return true;
  return allowed.has(key);
}

function matchesPath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeHref(pathname: string, hrefs: string[]) {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!matchesPath(pathname, href)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

export function Sidebar({
  username,
  role,
}: {
  username: string;
  role: string;
}) {
  const pathname = usePathname() ?? "";
  const allowed = useMemo(() => new Set(navKeysForRole(role)), [role]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  useEffect(() => {
    if (!navKeysForRole(role).includes("chat")) return;
    let stopped = false;
    async function loadUnread() {
      const res = await fetch("/api/dashboard/chat", { cache: "no-store" });
      if (!res.ok || stopped) return;
      const body = (await res.json()) as { unread?: number };
      if (!stopped) setChatUnread(body.unread ?? 0);
    }
    void loadUnread();
    const timer = window.setInterval(() => void loadUnread(), 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [role]);

  useEffect(() => {
    if (!navKeysForRole(role).includes("orders")) return;
    let stopped = false;
    let seen = new Set<string>();
    let ready = false;
    async function loadPending() {
      const res = await fetch("/api/admin/orders/alerts", { cache: "no-store" });
      if (!res.ok || stopped) return;
      const body = (await res.json()) as { count?: number; ids?: string[] };
      const ids = body.ids ?? [];
      if (ready && ids.some((id) => !seen.has(id))) {
        try {
          const audio = new AudioContext();
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          tone.frequency.value = 880;
          gain.gain.value = 0.04;
          tone.connect(gain);
          gain.connect(audio.destination);
          tone.start();
          tone.stop(audio.currentTime + 0.18);
          window.setTimeout(() => void audio.close(), 400);
        } catch {
          // Autoplay can be blocked until the next click.
        }
      }
      seen = new Set(ids);
      ready = true;
      if (!stopped) setPendingOrders(body.count ?? ids.length);
    }
    void loadPending();
    const timer = window.setInterval(() => void loadPending(), 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [role]);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.adminOnly && role !== "ADMIN") return false;
          return linkAllowed(item.key, allowed);
        }),
      })).filter((group) => group.items.length > 0),
    [allowed, role],
  );

  const overviewVisible = allowed.has("overview");
  const showPos = canUsePos(role);

  const hrefs = useMemo(() => {
    const list: string[] = [];
    if (overviewVisible) list.push(OVERVIEW.href);
    if (showPos) list.push("/pos");
    for (const group of groups) {
      for (const item of group.items) list.push(item.href);
    }
    return list;
  }, [groups, overviewVisible, showPos]);

  const currentHref = activeHref(pathname, hrefs);

  const activeGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (group.items.some((item) => item.href === currentHref)) {
        ids.add(group.id);
      }
    }
    return ids;
  }, [groups, currentHref]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupIds),
  );

  useEffect(() => {
    setOpenGroups(new Set(activeGroupIds));
  }, [pathname, activeGroupIds]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setExpanded(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const needle = query.trim();
  const filtering = needle.length > 0;

  const visibleGroups = useMemo(() => {
    if (!filtering) return groups;
    return groups
      .map((group) => {
        const groupMatch = group.label.includes(needle);
        const items = groupMatch
          ? group.items
          : group.items.filter((item) => item.label.includes(needle));
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [filtering, groups, needle]);

  const overviewMatch =
    !filtering || OVERVIEW.label.includes(needle);

  const showLabels = expanded;

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function groupIsOpen(id: string) {
    if (filtering) return true;
    return openGroups.has(id);
  }

  return (
    <aside
      dir="rtl"
      className={clsx(
        "dashboard-no-print flex h-full shrink-0 flex-col border-s border-slate-800 bg-slate-900 text-slate-300",
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

      <div
        className={clsx(
          "shrink-0 space-y-2 border-b border-slate-800 py-3",
          showLabels ? "px-3" : "px-2",
        )}
      >
        {showPos && (
          <Link
            href="/pos"
            title="فتح شاشة الكاشير (POS)"
            className={clsx(
              "bg-orange-500 text-white shadow-sm hover:bg-orange-600",
              "flex items-center justify-center gap-2 rounded-lg py-2 font-bold",
              showLabels ? "px-3" : "px-2",
              currentHref === "/pos" && "ring-2 ring-orange-300",
            )}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" />
            {showLabels && (
              <span className="truncate text-sm">فتح شاشة الكاشير (POS)</span>
            )}
          </Link>
        )}
        {showLabels && (
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث سريع في القوائم..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pe-8 ps-8 text-sm text-white outline-none placeholder:text-slate-500 focus:border-orange-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                aria-label="مسح البحث"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 py-3">
        {overviewVisible && overviewMatch && (
          <Link
            href={OVERVIEW.href}
            title={OVERVIEW.label}
            className={clsx(
              "flex items-center rounded-lg py-2.5 text-sm font-semibold transition-colors",
              showLabels ? "gap-2 px-2.5" : "justify-center px-2",
              currentHref === OVERVIEW.href
                ? "bg-orange-600 text-white"
                : "text-slate-200 hover:bg-slate-800 hover:text-white",
            )}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{OVERVIEW.label}</span>}
          </Link>
        )}

        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = groupIsOpen(group.id);
          const groupActive = group.items.some(
            (item) => item.href === currentHref,
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
                  if (filtering) return;
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
                <div className="ms-2 space-y-0.5 border-s border-slate-800 ps-2">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const active = item.href === currentHref;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={clsx(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-orange-600 text-white"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white",
                        )}
                      >
                        <ItemIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.key === "chat" && chatUnread > 0 && (
                          <span className="ms-auto rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                            {chatUnread}
                          </span>
                        )}
                        {item.key === "orders" && pendingOrders > 0 && (
                          <span className="ms-auto rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                            {pendingOrders}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}

              {!showLabels &&
                group.items.map((item) => {
                  const ItemIcon = item.icon;
                  const active = item.href === currentHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={clsx(
                        "relative flex items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                        active
                          ? "bg-orange-600 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white",
                      )}
                    >
                      <ItemIcon className="h-5 w-5 shrink-0" />
                      {item.key === "orders" && pendingOrders > 0 && (
                        <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-red-600" />
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}

        {filtering && visibleGroups.length === 0 && !overviewMatch && (
          <p className="px-2 py-3 text-center text-xs text-slate-500">
            لا توجد قوائم مطابقة
          </p>
        )}
      </nav>

      <div className="shrink-0 border-t border-slate-800 p-2">
        <button
          type="button"
          title="تسجيل الخروج"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={clsx(
            "flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/50 hover:text-red-200",
            showLabels ? "gap-2.5 px-2.5" : "justify-center px-2",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {showLabels && <span className="truncate">تسجيل الخروج</span>}
        </button>
      </div>
    </aside>
  );
}
