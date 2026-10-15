/** Cart and grid identity. Packages share the parent wcId but have their own key. */
export function posItemKey(product: {
  id: number | string;
  posKey?: string | null;
}): string {
  const key = product.posKey?.trim();
  return key || String(product.id);
}
