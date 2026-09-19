"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Shield, ScrollText, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import { ALL_ROLES } from "@/lib/auth/roles";

interface UserRow {
  id: string;
  username: string;
  role: string;
  status: string;
  hasPin: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  CASHIER: "Cashier",
};

export default function UsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("CASHIER");
  const [pinCode, setPinCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      const body = (await res.json()) as {
        error?: string;
        users?: UserRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load users");
      setUsers(body.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  function resetForm() {
    setUsername("");
    setPassword("");
    setRole("CASHIER");
    setPinCode("");
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      if (pinCode && !/^\d{4}$/.test(pinCode)) {
        throw new Error("PIN must be exactly 4 digits");
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          pinCode: pinCode || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not create user");
      setCreateOpen(false);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(user: UserRow) {
    if (user.id === currentUserId) return;
    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/toggle-status`, {
        method: "PATCH",
      });
      const body = (await res.json()) as {
        error?: string;
        user?: { status: string };
      };
      if (!res.ok) throw new Error(body.error ?? "Could not update status");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, status: body.user?.status ?? u.status }
            : u,
        ),
      );
      setToast({
        type: "success",
        message:
          body.user?.status === "SUSPENDED"
            ? `${user.username} suspended`
            : `${user.username} activated`,
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Toggle failed",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({
          type: "error",
          message:
            body.error ??
            "Cannot delete user with existing records. Please suspend them instead.",
        });
        setDeleteTarget(null);
        return;
      }
      setToast({
        type: "success",
        message: `${deleteTarget.username} deleted`,
      });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Delete failed",
      });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {toast && (
        <div
          className={clsx(
            "fixed right-4 top-4 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-emerald-600 text-white",
          )}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Users, Roles & Security
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create staff accounts, assign roles, and set POS override PINs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/users/logs"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50"
          >
            <ScrollText className="h-4 w-4 text-slate-500" />
            <span className="leading-tight">
              View Activity Logs
              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                سجل الحركات
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New User
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">PIN</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No users yet
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isActive = u.status === "ACTIVE";
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.username}
                      {isSelf && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Shield className="h-3.5 w-3.5" />
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.hasPin ? "Set" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isActive
                            ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                        }
                      >
                        {isActive ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          aria-label={
                            isActive ? "Suspend user" : "Activate user"
                          }
                          disabled={isSelf || togglingId === u.id}
                          onClick={() => void handleToggleStatus(u)}
                          title={
                            isSelf
                              ? "You cannot change your own status"
                              : isActive
                                ? "Suspend"
                                : "Activate"
                          }
                          className={clsx(
                            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            isActive ? "bg-emerald-500" : "bg-slate-300",
                          )}
                        >
                          <span
                            className={clsx(
                              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                              isActive && "translate-x-5",
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => setDeleteTarget(u)}
                          title={
                            isSelf
                              ? "You cannot delete your own account"
                              : "Delete user"
                          }
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          aria-label="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">New User</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => void handleCreate(e)}
              className="space-y-4 px-5 py-5"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Username
                </span>
                <input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </span>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Role
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  POS PIN (4 digits, optional)
                </span>
                <input
                  inputMode="numeric"
                  value={pinCode}
                  onChange={(e) =>
                    setPinCode(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
                  }
                  placeholder="Required for Manager/Admin overrides"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 tracking-widest focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </label>

              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  {isSaving ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Delete user?
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Permanently remove{" "}
                <span className="font-semibold text-slate-800">
                  {deleteTarget.username}
                </span>
                . If they have sales, shifts, or audit logs, deletion will be
                blocked — suspend them instead.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
