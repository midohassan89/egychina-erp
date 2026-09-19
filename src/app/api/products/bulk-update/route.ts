import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  bulkUpdateProducts,
  BulkUpdateError,
  type BulkProductRow,
} from "@/lib/products/bulkUpdate";
import { WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST { products: BulkProductRow[] }
 * Updates Prisma in a transaction, then WooCommerce products/batch.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { products?: BulkProductRow[] };
    const result = await bulkUpdateProducts(body.products ?? []);
    return NextResponse.json({
      ok: true,
      message: `Updated ${result.updated} products on ERP & WooCommerce`,
      ...result,
    });
  } catch (error) {
    if (error instanceof BulkUpdateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof WooCommerceError) {
      return NextResponse.json(
        { error: error.message, endpoint: error.endpoint },
        { status: error.statusCode ?? 502 },
      );
    }
    // Prisma record not found, etc.
    console.error("[api/products/bulk-update]", error);
    const message =
      error instanceof Error ? error.message : "Bulk update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
