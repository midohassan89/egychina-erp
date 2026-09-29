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
    title: "الموردين",
    description: "سجل الموردين والأرصدة",
    icon: Truck,
    usersOnly: false,
  },
  {
    href: "/dashboard/purchases",
    title: "المشتريات",
    description: "فواتير الموردين والاستلام",
    icon: ShoppingBag,
    usersOnly: false,
  },
  {
    href: "/dashboard/sales",
    title: "سجل المبيعات",
    description: "فواتير الكاشير والمرتجعات",
    icon: History,
    usersOnly: false,
  },
  {
    href: "/dashboard/expenses",
    title: "المصروفات",
    description: "تصنيفات وسجل المصروفات",
    icon: Receipt,
    usersOnly: false,
  },
  {
    href: "/dashboard/treasury",
    title: "الخزينة",
    description: "أرصدة الخزينة والبنوك",
    icon: Wallet,
    usersOnly: false,
  },
  {
    href: "/dashboard/shifts",
    title: "سجل الورديات",
    description: "تقفيل الكاشير وتقارير Z",
    icon: ClipboardList,
    usersOnly: false,
  },
  {
    href: "/dashboard/inventory",
    title: "المخزون",
    description: "مستويات المخزون والجرد",
    icon: Package,
    usersOnly: false,
  },
  {
    href: "/dashboard/reports",
    title: "التقارير",
    description: "الأرباح، الأكثر مبيعاً، والنواقص",
    icon: BarChart3,
    usersOnly: false,
  },
  {
    href: "/dashboard/audit",
    title: "مراجعة المبيعات",
    description: "مراجعة فواتير الكاشير",
    icon: ShieldAlert,
    usersOnly: false,
    managersOnly: true,
  },
  {
    href: "/dashboard/users",
    title: "المستخدمين والصلاحيات",
    description: "إدارة حسابات الموظفين",
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
      <div className="text-right">
        <h1 className="text-2xl font-bold text-slate-900">لوحة تحكم النظام</h1>
        <p className="mt-1 text-slate-500">
          وحدات الحسابات والإدارة لسوق العبور
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-slate-200 bg-white p-5 text-right shadow-sm hover:shadow-md"
          >
            <div className="mb-3 inline-flex rounded-lg bg-brand-600 p-2.5 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
