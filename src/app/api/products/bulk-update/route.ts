import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  bulkUpdateProducts,
  BulkUpdateError,
  type BulkProductRow,
} from "@/lib/products/bulkUpdate";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST { products: BulkProductRow[] }
 * Updates products locally, creating missing brands and categories by name.
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
      message: `Updated ${result.updated} products`,
      ...result,
    });
  } catch (error) {
    if (error instanceof BulkUpdateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    // Prisma record not found, etc.
    console.error("[api/products/bulk-update]", error);
    const message =
      error instanceof Error ? error.message : "Bulk update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
