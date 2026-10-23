import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";

type Db = Prisma.TransactionClient | PrismaClient;

export const MIN_CUSTOMER_PASSWORD = 6;

export function customerPasswordError(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "password is required";
  if (value.length < MIN_CUSTOMER_PASSWORD) {
    return "password must be at least 6 characters";
  }
  if (value.length > 128) return "password is too long";
  return null;
}

export function hashCustomerPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyCustomerPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash || !password) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function normalizeCustomerPhone(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  return normalizeLoyaltyPhone(text) || text;
}

/** Active store customer, including the password hash for auth checks only. */
export async function findCustomerAccount(db: Db, rawPhone: unknown) {
  const raw = String(rawPhone ?? "").trim();
  const phone = normalizeCustomerPhone(raw);
  if (!phone) return null;
  return db.customer.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { phone },
        ...(raw && raw !== phone ? [{ phone: raw }] : []),
        ...(phone.length >= 10 ? [{ phone: { contains: phone.slice(-10) } }] : []),
      ],
    },
    select: { id: true, phone: true, name: true, password: true, pinHash: true },
  });
}

export function customerAccountState(customer: {
  name: string | null;
  password: string | null;
} | null) {
  const name = customer?.name?.trim() || null;
  return {
    exists: Boolean(customer),
    hasPassword: Boolean(customer?.password),
    hasName: Boolean(name),
    name,
  };
}
