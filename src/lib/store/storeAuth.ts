import { timingSafeEqual } from "crypto";

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
  if (bearer?.[1]?.trim()) return bearer[1].trim();

  if (typeof bodyCustomerId === "string" && bodyCustomerId.trim()) {
    return bodyCustomerId.trim();
  }

  const urlId = new URL(request.url).searchParams.get("customerId")?.trim();
  return urlId ?? "";
}
