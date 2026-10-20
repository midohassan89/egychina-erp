const PLACEHOLDER = "/placeholder.png";
const LOCALHOST_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i;

/**
 * Live origin used when a stored URL still points at the local dev server
 * and is not a file this app serves itself.
 * Set NEXT_PUBLIC_API_URL in the production environment.
 */
function productionBackendUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (configured || "https://erp.echinamart.com").replace(/\/$/, "");
}

/**
 * `http://localhost:3001/uploads/...` cannot be resolved by a browser on the
 * live site. Files under /uploads are served by this app, so keep only the path.
 * Any other localhost URL is swapped for the production backend in production.
 */
function rewriteLocalhost(url: string): string {
  if (!LOCALHOST_ORIGIN.test(url)) return url;

  try {
    const parsed = new URL(url);
    if (
      parsed.pathname.startsWith("/uploads/") ||
      parsed.pathname === PLACEHOLDER
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Not a parseable absolute URL; fall through to the host swap.
  }

  if (process.env.NODE_ENV !== "production") return url;
  return url.replace(LOCALHOST_ORIGIN, productionBackendUrl());
}

/**
 * Normalize a product image URL so Arabic (and other non-ASCII) characters
 * are percent-encoded exactly once. Empty values fall back to a local placeholder.
 */
export function safeImageUrl(url: string | null | undefined): string {
  const value = rewriteLocalhost(url?.trim() ?? "");
  if (!value) return PLACEHOLDER;
  try {
    return encodeURI(decodeURI(value));
  } catch {
    try {
      return encodeURI(value);
    } catch {
      return PLACEHOLDER;
    }
  }
}
