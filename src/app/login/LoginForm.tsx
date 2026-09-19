"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { homeForRole } from "@/lib/auth/roles";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Read latest values from the form (avoids stale controlled-state races)
    const form = e.currentTarget;
    const formData = new FormData(form);
    const user =
      String(formData.get("username") ?? username).trim() || username.trim();
    const pass = String(formData.get("password") ?? password) || password;

    if (!user || !pass) {
      setError("Username and password are required.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await signIn("credentials", {
        username: user,
        password: pass,
        redirect: false,
      });

      if (res?.error || !res?.ok) {
        setError("Invalid username or password.");
        return;
      }

      // Refresh client session cache BEFORE navigating
      router.refresh();

      const session = await getSession();
      const role = session?.user?.role;
      const callback = searchParams.get("callbackUrl");

      if (callback && callback.startsWith("/") && !callback.startsWith("//")) {
        router.push(callback);
      } else {
        router.push(homeForRole(role));
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            SO
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Souq El Obour
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to POS / Accounting
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? "Logging in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Default admin: <code className="text-slate-600">admin</code> /{" "}
          <code className="text-slate-600">admin123</code> · PIN{" "}
          <code className="text-slate-600">1234</code>
        </p>
      </div>
    </div>
  );
}
