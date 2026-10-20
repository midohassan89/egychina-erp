import type { NextAuthConfig } from "next-auth";
import {
  CASHIER_SESSION_MAX_AGE_SEC,
  DASHBOARD_SESSION_MS,
  isPosSessionRole,
  SESSION_UPDATE_AGE_SEC,
} from "@/lib/auth/sessionPolicy";

export type AppRole =
  | "CASHIER"
  | "ACCOUNTANT"
  | "MANAGER"
  | "ADMIN"
  | "DRIVER";

export {
  CASHIER_SESSION_MAX_AGE_SEC,
  DASHBOARD_SESSION_MS,
  SESSION_UPDATE_AGE_SEC,
} from "@/lib/auth/sessionPolicy";

/**
 * Edge-safe Auth.js config (no Prisma / Node APIs).
 * Used by middleware. Full providers live in `auth.ts`.
 *
 * Cookie maxAge is 365 days so cashiers can stay signed in.
 * Absolute 12-hour expiry is enforced in the jwt callback for every
 * role except CASHIER (dashboard staff only).
 */
export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: CASHIER_SESSION_MAX_AGE_SEC,
    updateAge: SESSION_UPDATE_AGE_SEC,
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth")) return true;
      if (pathname === "/login") return true;
      if (
        pathname.startsWith("/price-checker") ||
        pathname.startsWith("/api/price-checker") ||
        pathname.startsWith("/api/store") ||
        pathname.startsWith("/api/driver")
      ) {
        return true;
      }
      // Drivers must not use the web dashboard — only the mobile API.
      if (auth?.user?.role === "DRIVER") {
        return pathname === "/login";
      }
      return !!auth?.user;
    },
    jwt({ token, user, trigger }) {
      const now = Date.now();
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.loginAt = now;
        return token;
      }

      // Silent refresh while POS / cashier keeps working — bump activity stamp.
      if (trigger === "update" && isPosSessionRole(token.role)) {
        token.lastSeenAt = now;
        return token;
      }

      // CASHIER and POS-capable staff: cookie lives up to 365 days (sliding via updateAge).
      // Absolute 12h logout for these roles is enforced only on the dashboard client.
      if (isPosSessionRole(token.role)) {
        return token;
      }

      const loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
      if (!loginAt || now - loginAt > DASHBOARD_SESSION_MS) return null;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role =
          typeof token.role === "string"
            ? (token.role as AppRole)
            : "CASHIER";
      }
      if (typeof token.loginAt === "number") {
        session.loginAt = token.loginAt;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
