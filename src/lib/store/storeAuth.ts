import { timingSafeEqual } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";

type DbClient = Prisma.TransactionClient | PrismaClient;

/** Strip wrapping quotes + whitespace from .env values. */
export function cleanEnvSecret(raw: string | undefined | null): string {
  let value = (raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/^["']+|["']+$/g, "").trim();
}

export function apiKeyMatches(provided: string, expected: string): boolean {
  const a = cleanEnvSecret(provided);
  const b = cleanEnvSecret(expected);
  const providedBytes = Buffer.from(a);
  const expectedBytes = Buffer.from(b);
  if (
    providedBytes.length === 0 ||
    providedBytes.length !== expectedBytes.length
  ) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/** Validate STORE_API_KEY from x-api-key header. */
export function requireStoreApiKey(request: Request): boolean {
  const expectedKey = cleanEnvSecret(process.env.STORE_API_KEY);
  const providedKey = cleanEnvSecret(
    request.headers.get("x-api-key") ??
      request.headers.get("X-API-KEY") ??
      "",
  );
  return Boolean(expectedKey && apiKeyMatches(providedKey, expectedKey));
}

/**
 * Resolve the authenticated storefront customer id from:
 * - x-customer-id header
 * - Authorization: Bearer <customerId>
 * - customerId query / body field (caller passes separately)
 */
export function resolveCustomerIdFromRequest(
  request: Request,
  bodyCustomerId?: unknown,
): string {
  const headerId = String(
    request.headers.get("x-customer-id") ??
      request.headers.get("X-Customer-Id") ??
      "",
  ).trim();
  if (headerId) return headerId;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (bearer?.[1]?.trim()) {
    const token = bearer[1].trim();
    // Phone-based apps sometimes send the phone as Bearer token
    if (!looksLikePhone(token)) return token;
  }

  if (typeof bodyCustomerId === "string" && bodyCustomerId.trim()) {
    return bodyCustomerId.trim();
  }

  const urlId = new URL(request.url).searchParams.get("customerId")?.trim();
  return urlId ?? "";
}

/**
 * Resolve phone from headers / query / body.
 * Accepts: x-customer-phone, phone / phoneNumber / mobile query or body fields,
 * and Authorization: Bearer <phone> when the token looks like a phone.
 */
export function resolvePhoneFromRequest(
  request: Request,
  bodyPhone?: unknown,
): string {
  const headerPhone = String(
    request.headers.get("x-customer-phone") ??
      request.headers.get("X-Customer-Phone") ??
      request.headers.get("x-phone") ??
      "",
  ).trim();
  if (headerPhone) return normalizeLoyaltyPhone(headerPhone) || headerPhone;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (bearer?.[1]?.trim() && looksLikePhone(bearer[1])) {
    const raw = bearer[1].trim();
    return normalizeLoyaltyPhone(raw) || raw;
  }

  const fromBody = String(bodyPhone ?? "").trim();
  if (fromBody) return normalizeLoyaltyPhone(fromBody) || fromBody;

  const url = new URL(request.url);
  const fromQuery = String(
    url.searchParams.get("phone") ??
      url.searchParams.get("phoneNumber") ??
      url.searchParams.get("mobile") ??
      "",
  ).trim();
  if (fromQuery) return normalizeLoyaltyPhone(fromQuery) || fromQuery;

  return "";
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/** Find customer by id and/or phone (flexible match used by store APIs). */
export async function findCustomerByIdOrPhone(
  db: DbClient,
  opts: { customerId?: string; phone?: string },
): Promise<{ id: string; phone: string; name: string | null } | null> {
  const customerId = opts.customerId?.trim() || "";
  const phoneRaw = opts.phone?.trim() || "";
  const phone = phoneRaw ? normalizeLoyaltyPhone(phoneRaw) || phoneRaw : "";

  if (customerId) {
    const byId = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, name: true },
    });
    if (byId) return byId;
  }

  if (!phone) return null;

  return db.customer.findFirst({
    where: {
      OR: [
        { phone },
        { phone: phoneRaw },
        ...(phone.length >= 10
          ? [{ phone: { contains: phone.slice(-10) } }]
          : []),
      ],
    },
    select: { id: true, phone: true, name: true },
  });
}

/**
 * Resolve customer for address APIs.
 * - GET: find by customerId or phone (no create)
 * - POST: find by customerId or phone; if only phone and missing, create
 */
export async function resolveStoreCustomer(
  db: DbClient,
  opts: {
    customerId?: string;
    phone?: string;
    name?: string | null;
    createIfMissing?: boolean;
  },
): Promise<{ id: string; phone: string; name: string | null } | null> {
  const existing = await findCustomerByIdOrPhone(db, opts);
  if (existing) return existing;

  if (!opts.createIfMissing) return null;

  const phoneRaw = opts.phone?.trim() || "";
  const phone = phoneRaw ? normalizeLoyaltyPhone(phoneRaw) || phoneRaw : "";
  if (!phone) return null;

  const name = opts.name?.trim() || null;
  return db.customer.create({
    data: {
      phone,
      ...(name ? { name } : {}),
    },
    select: { id: true, phone: true, name: true },
  });
}
