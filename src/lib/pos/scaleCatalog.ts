import type { CachedProduct } from "@/types/woocommerce";

/**
 * Built-in PLU map for scale-packed deli and produce items.
 * Catalog products matching PLU via `_op_barcode` / SKU take precedence.
 */
export const SCALE_PLU_CATALOG: Record<
  string,
  { name: string; unitPrice: number; category: "deli" | "produce" }
> = {
  "10001": { name: "Roumy Cheese", unitPrice: 280, category: "deli" },
  "10002": { name: "Baramili Cheese", unitPrice: 220, category: "deli" },
  "10003": { name: "White Cheese", unitPrice: 160, category: "deli" },
  "20001": { name: "Apples", unitPrice: 45, category: "produce" },
  "20002": { name: "Bananas", unitPrice: 30, category: "produce" },
  "20003": { name: "Tomatoes", unitPrice: 20, category: "produce" },
  "20004": { name: "Oranges", unitPrice: 35, category: "produce" },
  "20005": { name: "Cucumbers", unitPrice: 18, category: "produce" },
};

export const QUICK_CATEGORIES = [
  { id: "all", label: "All Items", match: [] as string[] },
  {
    id: "produce",
    label: "Fresh Produce",
    match: ["produce", "fruit", "fruits", "vegetable", "vegetables", "fresh"],
  },
  {
    id: "deli",
    label: "Deli",
    match: ["deli", "cheese", "charcuterie", "cold cuts"],
  },
  {
    id: "dairy",
    label: "Dairy",
    match: ["dairy", "milk", "yogurt"],
  },
  {
    id: "bakery",
    label: "Bakery",
    match: ["bakery", "bread"],
  },
  {
    id: "grocery",
    label: "Grocery",
    match: ["grocery", "dry", "pantry"],
  },
  {
    id: "beverages",
    label: "Beverages",
    match: ["beverage", "beverages", "drinks", "juice", "water"],
  },
] as const;

export function productFromScalePlu(pluPadded: string): CachedProduct | null {
  const entry = SCALE_PLU_CATALOG[pluPadded];
  if (!entry) return null;

  const now = new Date().toISOString();
  return {
    id: Number(`9${pluPadded}`),
    name: entry.name,
    slug: entry.name.toLowerCase().replace(/\s+/g, "-"),
    sku: pluPadded,
    price: String(entry.unitPrice),
    regular_price: String(entry.unitPrice),
    sale_price: "",
    on_sale: false,
    stock_quantity: null,
    stock_status: "instock",
    manage_stock: false,
    categories: [
      {
        id: entry.category === "deli" ? 9001 : 9002,
        name: entry.category === "deli" ? "Deli" : "Fresh Produce",
        slug: entry.category,
      },
    ],
    images: [],
    description: "Scale-weighed item",
    short_description: "Sold by weight",
    status: "publish",
    type: "simple",
    isLocal: true,
    meta_data: [{ key: "_op_barcode", value: pluPadded }],
    cachedAt: now,
  };
}

export function builtInQuickTapProducts(): CachedProduct[] {
  return Object.keys(SCALE_PLU_CATALOG)
    .map((plu) => productFromScalePlu(plu))
    .filter((p): p is CachedProduct => p !== null);
}
