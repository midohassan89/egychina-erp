import { NextResponse } from "next/server";
import { getCategories, getCustomers, getProducts } from "@/lib/woocommerce";
import { wooCommerceErrorResponse } from "@/lib/woocommerce/apiResponse";
import type {
  CachedCategory,
  CachedCustomer,
  CachedProduct,
} from "@/types/woocommerce";

export async function GET() {
  try {
    const [products, categories, customers] = await Promise.all([
      getProducts(),
      getCategories(),
      getCustomers(),
    ]);

    const now = new Date().toISOString();

    const cachedProducts: CachedProduct[] = products.map((p) => ({
      ...p,
      cachedAt: now,
    }));

    const cachedCategories: CachedCategory[] = categories.map((c) => ({
      ...c,
      cachedAt: now,
    }));

    const cachedCustomers: CachedCustomer[] = customers.map((c) => ({
      ...c,
      cachedAt: now,
    }));

    return NextResponse.json({
      products: cachedProducts,
      categories: cachedCategories,
      customers: cachedCustomers,
      syncedAt: now,
    });
  } catch (error) {
    return wooCommerceErrorResponse(error, "Sync API");
  }
}
