import Link from "next/link";
import {
  BarChart3,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/pos", label: "نقطة البيع", icon: ShoppingCart },
  { href: "/products", label: "المنتجات", icon: Package },
  { href: "/customers", label: "العملاء", icon: Users },
  { href: "/accounting", label: "الحسابات", icon: Receipt },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

interface SidebarProps {
  currentPath: string;
}

export function Sidebar({ currentPath }: SidebarProps) {
  return (
    <aside
      dir="rtl"
      className="flex h-full w-64 flex-col bg-slate-900 text-slate-200"
    >
      <div className="border-b border-slate-700 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">
            SO
          </div>
          <div>
            <p className="text-sm font-semibold text-white">سوق العبور</p>
            <p className="text-xs text-slate-400">نقطة البيع · النظام</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? currentPath === "/"
              : currentPath.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-orange-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-700 px-6 py-4">
        <p className="text-xs text-slate-500">الإصدار 0.1.0</p>
      </div>
    </aside>
  );
}
