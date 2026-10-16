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
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { canManageUsers, isManagerOrAdmin } from "@/lib/auth/roles";

type Card = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  usersOnly?: boolean;
  managersOnly?: boolean;
};

const sections: { title: string; cards: Card[] }[] = [
  {
    title: "الكاشير ونقاط البيع",
    cards: [
      {
        href: "/dashboard/sales",
        title: "فواتير مبيعات الكاشير",
        description: "فواتير نقطة البيع والمرتجعات",
        icon: History,
      },
      {
        href: "/dashboard/shifts",
        title: "الورديات وتقارير Z",
        description: "تقفيل الكاشير وتقارير نهاية الوردية",
        icon: ClipboardList,
      },
      {
        href: "/dashboard/audit",
        title: "مراجعة وتدقيق الكاشير",
        description: "مراجعة فواتير الكاشير التي تحتاج تدقيقاً",
        icon: ShieldAlert,
        managersOnly: true,
      },
    ],
  },
  {
    title: "المخازن والمشتريات",
    cards: [
      {
        href: "/dashboard/inventory",
        title: "أرصدة وحركة المخزون",
        description: "مستويات المخزون وحركة الأصناف",
        icon: Package,
      },
      {
        href: "/dashboard/purchases",
        title: "فواتير المشتريات",
        description: "فواتير الموردين والاستلام",
        icon: ShoppingBag,
      },
      {
        href: "/dashboard/suppliers",
        title: "سجل وحسابات الموردين",
        description: "سجل الموردين والأرصدة المستحقة",
        icon: Truck,
      },
    ],
  },
  {
    title: "المالية والحسابات",
    cards: [
      {
        href: "/dashboard/treasury",
        title: "الخزينة والحسابات البنكية",
        description: "أرصدة الخزينة والبنوك",
        icon: Wallet,
      },
      {
        href: "/dashboard/expenses",
        title: "المصروفات التشغيلية",
        description: "تصنيفات وسجل المصروفات",
        icon: Receipt,
      },
      {
        href: "/dashboard/reports",
        title: "التقارير المالية والأرباح",
        description: "الأرباح، الأكثر مبيعاً، والنواقص",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "الموارد البشرية والرقابة",
    cards: [
      {
        href: "/dashboard/users",
        title: "المستخدمين والصلاحيات",
        description: "إدارة حسابات الموظفين",
        icon: Shield,
        usersOnly: true,
      },
    ],
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const showUsers = canManageUsers(session?.user?.role);
  const showAudit = isManagerOrAdmin(session?.user?.role);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      cards: section.cards.filter((card) => {
        if (card.usersOnly && !showUsers) return false;
        if (card.managersOnly && !showAudit) return false;
        return true;
      }),
    }))
    .filter((section) => section.cards.length > 0);

  return (
    <div className="space-y-6">
      <div className="text-right">
        <h1 className="text-2xl font-bold text-slate-900">
          لوحة المؤشرات العامة
        </h1>
        <p className="mt-1 text-slate-500">
          وحدات الحسابات والإدارة لسوق العبور
        </p>
      </div>
      {visibleSections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">
            {section.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.cards.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm hover:shadow-md"
              >
                <div className="mb-2 inline-flex rounded-lg bg-brand-600 p-2 text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
