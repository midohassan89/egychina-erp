/**
 * Normalize a product image URL so Arabic (and other non-ASCII) characters
 * are percent-encoded exactly once. Empty values fall back to a local placeholder.
 */
export function safeImageUrl(url: string | null | undefined): string {
  const value = url?.trim();
  if (!value) return "/placeholder.png";
  try {
    return encodeURI(decodeURI(value));
  } catch {
    try {
      return encodeURI(value);
    } catch {
      return "/placeholder.png";
    }
  }
}
