"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { homeForRole } from "@/lib/auth/roles";

const STORAGE_KEY = "erp_quick_users";

interface SavedUser {
  username: string;
  password: string;
  role: string;
}

const ROLE_CARD: Record<string, { label: string; icon: string; ring: string }> = {
  ADMIN: { label: "مالك / المدير العام", icon: "👑", ring: "border-amber-300 bg-amber-50" },
  MANAGER: { label: "مدير فرع", icon: "🛡️", ring: "border-sky-300 bg-sky-50" },
  ACCOUNTANT: { label: "محاسب مالي", icon: "📊", ring: "border-emerald-300 bg-emerald-50" },
  CASHIER: { label: "كاشير", icon: "🖥️", ring: "border-violet-300 bg-violet-50" },
  DRIVER: { label: "سائق", icon: "🚚", ring: "border-slate-300 bg-slate-50" },
  WAREHOUSE: { label: "مسؤول مخازن / مدخل بيانات", icon: "📦", ring: "border-orange-300 bg-orange-50" },
};

function readSaved(): SavedUser[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedUser[];
    return Array.isArray(parsed) ? parsed.filter((row) => row.username && row.password) : [];
  } catch {
    return [];
  }
}

function writeSaved(users: SavedUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState<SavedUser[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const urlError = useMemo(() => {
    if (searchParams.get("error") === "driver-app-only") {
      return "حسابات السائقين متاحة عبر تطبيق الموبايل فقط — لا يمكن الدخول للوحة التحكم.";
    }
    return null;
  }, [searchParams]);

  useEffect(() => {
    const rows = readSaved();
    setSaved(rows);
    setShowOther(rows.length === 0);
  }, []);

  async function login(user: string, pass: string) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        username: user,
        password: pass,
        redirect: false,
      });
      if (res?.error || !res?.ok) {
        setUsername(user);
        setPassword("");
        setShowOther(true);
        setError("اسم المستخدم أو كلمة المرور غير صحيحة.");
        return;
      }
      router.refresh();
      const session = await getSession();
      const role = session?.user?.role ?? "CASHIER";
      const next = saved.filter((row) => row.username !== user);
      next.unshift({ username: user, password: pass, role });
      writeSaved(next.slice(0, 12));
      setSaved(next.slice(0, 12));
      const callback = searchParams.get("callbackUrl");
      if (callback && callback.startsWith("/") && !callback.startsWith("//")) {
        router.push(callback);
      } else {
        router.push(homeForRole(role));
      }
    } catch {
      setError("تعذر الاتصال. حاول مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const user = String(form.get("username") ?? username).trim();
    const pass = String(form.get("password") ?? password);
    if (!user || !pass) {
      setError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    void login(user, pass);
  }

  function removeSaved(name: string) {
    const next = saved.filter((row) => row.username !== name);
    writeSaved(next);
    setSaved(next);
    if (next.length === 0) setShowOther(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="text-center">
          <BrandLogo className="mx-auto h-24 w-auto max-w-full object-contain sm:h-32" />
          <p className="mt-3 text-sm text-slate-500">اختر حسابك للدخول السريع إلى المنظومة</p>
        </div>

        {saved.length > 0 && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {saved.map((row) => {
              const card = ROLE_CARD[row.role] ?? ROLE_CARD.CASHIER;
              return (
                <div key={row.username} className={`relative rounded-2xl border p-4 ${card.ring}`}>
                  <button
                    type="button"
                    onClick={() => removeSaved(row.username)}
                    className="absolute left-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-500"
                    aria-label="حذف الحساب من الجهاز"
                  >
                    ✕ حذف الحساب من الجهاز
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void login(row.username, row.password)}
                    className="block w-full pt-6 text-right disabled:opacity-60"
                  >
                    <span className="text-3xl">{card.icon}</span>
                    <span className="mt-2 block text-lg font-bold text-slate-900">{row.username}</span>
                    <span className="mt-1 block text-sm text-slate-600">{card.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowOther((value) => !value)}
          className="mt-6 w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-700"
        >
          + تسجيل الدخول بحساب آخر
        </button>

        {showOther && (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">اسم المستخدم</span>
              <input
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">كلمة المرور</span>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-11 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:bg-slate-300"
            >
              {isLoading ? "جاري الدخول…" : "دخول"}
            </button>
          </form>
        )}

        {(error || urlError) && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? urlError}</p>
        )}
      </div>
    </div>
  );
}
