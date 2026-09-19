import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PurchaseServiceError } from "@/lib/purchases/createPurchase";
import { createPurchaseReturn } from "@/lib/purchases/createPurchaseReturn";
import { WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/purchases/returns/create
 * RTV: save return, decrease supplier balance + local stock, WC batch sync.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    supplierId?: number;
    date?: string | null;
    notes?: string | null;
    items?: {
      productId?: string;
      quantity?: number;
      unitCost?: number;
    }[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await createPurchaseReturn({
      supplierId: Number(body.supplierId),
      date: body.date,
      notes: body.notes,
      items: (body.items ?? []).map((row) => ({
        productId: String(row.productId ?? ""),
        quantity: Number(row.quantity),
        unitCost: Number(row.unitCost),
      })),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PurchaseServiceError) {
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
    console.error("[api/purchases/returns/create]", error);
    return NextResponse.json(
      { error: "Could not create purchase return" },
      { status: 500 },
    );
  }
}
