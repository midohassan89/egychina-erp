import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pullProductsFromWooCommerce } from "@/lib/products/pullFromWooCommerce";
import { WooCommerceError } from "@/lib/woocommerce/client";

/**
 * Pull Arabic WooCommerce products into the local Prisma catalog.
 * Manager / Accountant only.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "MANAGER" && session.user.role !== "ACCOUNTANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pullProductsFromWooCommerce();
    return NextResponse.json({
      ok: true,
      message: `Synced ${result.upserted} products from WooCommerce (lang=ar).`,
      ...result,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof WooCommerceError) {
      return NextResponse.json(
        { error: error.message, endpoint: error.endpoint },
        { status: error.statusCode ?? 500 },
      );
    }
    console.error("[sync/pull-from-wc]", error);
    return NextResponse.json(
      { error: "Failed to pull catalog from WooCommerce" },
      { status: 500 },
    );
  }
}
