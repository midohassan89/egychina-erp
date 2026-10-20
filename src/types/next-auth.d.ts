import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/auth.config";

declare module "next-auth" {
  interface User {
    role: AppRole;
  }

  interface Session {
    /** Epoch ms when this session was created (fresh login). */
    loginAt?: number;
    user: DefaultSession["user"] & {
      id: string;
      role: AppRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    loginAt?: number;
    lastSeenAt?: number;
  }
}
