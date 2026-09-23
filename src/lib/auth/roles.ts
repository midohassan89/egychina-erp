import type { AppRole } from "@/auth.config";

export const ALL_ROLES = [
  "CASHIER",
  "ACCOUNTANT",
  "MANAGER",
  "ADMIN",
] as const satisfies readonly AppRole[];

/** Dashboard write APIs (purchases, treasury, products, etc.). */
export function isEditor(role?: string | null): boolean {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

export function isAdmin(role?: string | null): boolean {
  return role === "ADMIN";
}

/** Staff management (Users & Roles) — Manager and Admin. */
export function canManageUsers(role?: string | null): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function isManagerOrAdmin(role?: string | null): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function canUsePos(role?: string | null): boolean {
  return role === "CASHIER" || role === "MANAGER" || role === "ADMIN";
}

export function homeForRole(role?: string | null): string {
  if (role === "CASHIER") return "/pos";
  if (
    role === "ACCOUNTANT" ||
    role === "MANAGER" ||
    role === "ADMIN"
  ) {
    return "/dashboard";
  }
  return "/login";
}

/**
 * Which dashboard sidebar links each role may see.
 * Exact path match for Overview; prefix match for nested routes.
 */
export type NavAccess =
  | "overview"
  | "products"
  | "suppliers"
  | "purchases"
  | "sales"
  | "inventory"
  | "expenses"
  | "treasury"
  | "reports"
  | "shifts"
  | "audit"
  | "users"
  | "profile";

const ROLE_NAV: Record<string, NavAccess[]> = {
  CASHIER: [],
  ACCOUNTANT: [
    "overview",
    "suppliers",
    "purchases",
    "expenses",
    "treasury",
    "shifts",
    "profile",
  ],
  MANAGER: [
    "overview",
    "products",
    "suppliers",
    "purchases",
    "sales",
    "inventory",
    "expenses",
    "treasury",
    "reports",
    "shifts",
    "audit",
    "users",
    "profile",
  ],
  ADMIN: [
    "overview",
    "products",
    "suppliers",
    "purchases",
    "sales",
    "inventory",
    "expenses",
    "treasury",
    "reports",
    "shifts",
    "audit",
    "users",
    "profile",
  ],
};

export function navKeysForRole(role?: string | null): NavAccess[] {
  return ROLE_NAV[role ?? ""] ?? [];
}

/**
 * Middleware path guard for /dashboard/* pages.
 * Returns redirect path if blocked, otherwise null.
 */
export function dashboardBlockRedirect(
  role: string | undefined,
  pathname: string,
): string | null {
  if (role === "CASHIER") return "/pos";

  // Audit logs — Admin only (before general users check)
  if (
    pathname.startsWith("/dashboard/users/logs") &&
    role !== "ADMIN"
  ) {
    return "/dashboard";
  }

  // Edit purchase invoice — Admin only
  if (
    pathname.startsWith("/dashboard/purchases/edit") &&
    role !== "ADMIN"
  ) {
    return "/dashboard/purchases";
  }

  // Sale audit queue — Manager and Admin
  if (
    pathname.startsWith("/dashboard/audit") &&
    role !== "ADMIN" &&
    role !== "MANAGER"
  ) {
    return "/dashboard";
  }

  // Users & Roles — Manager and Admin only
  if (
    pathname.startsWith("/dashboard/users") &&
    role !== "ADMIN" &&
    role !== "MANAGER"
  ) {
    return "/dashboard";
  }

  if (role === "ACCOUNTANT") {
    const allowed = [
      "/dashboard",
      "/dashboard/suppliers",
      "/dashboard/purchases",
      "/dashboard/expenses",
      "/dashboard/treasury",
      "/dashboard/shifts",
      "/dashboard/profile",
    ];
    const ok = allowed.some(
      (p) => pathname === p || (p !== "/dashboard" && pathname.startsWith(p)),
    );
    if (pathname === "/dashboard") return null;
    if (!ok) return "/dashboard";
  }

  return null;
}
