import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ProductServiceError,
  restockProductsByWcId,
} from "@/lib/products/productService";
import { WooCommerceError } from "@/lib/woocommerce/client";

/**
 * POST /api/pos/restock
 * Increase Prisma + WooCommerce stock for returned items.
 * Authenticated POS users only (cashier completing a manager-authorized return).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    items?: { wcId?: number; productId?: number; qty?: number }[];
    managerId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.managerId || typeof body.managerId !== "string") {
    return NextResponse.json(
      { error: "Manager authorization required" },
      { status: 400 },
    );
  }

  const items = (body.items ?? [])
    .map((row) => ({
      wcId: Number(row.wcId ?? row.productId),
      qty: Math.floor(Math.abs(Number(row.qty))),
    }))
    .filter((row) => Number.isFinite(row.wcId) && row.wcId > 0 && row.qty > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: "No items to restock" }, { status: 400 });
  }

  try {
    const results = await restockProductsByWcId(items);
    return NextResponse.json({
      ok: true,
      restocked: results,
      cashierId: session.user.id,
      managerId: body.managerId,
    });
  } catch (error) {
    if (error instanceof ProductServiceError) {
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
    console.error("[api/pos/restock]", error);
    return NextResponse.json({ error: "Restock failed" }, { status: 500 });
  }
}
