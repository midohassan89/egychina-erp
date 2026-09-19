import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createPurchaseInvoice,
  PurchaseServiceError,
} from "@/lib/purchases/createPurchase";
import { WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/purchases/create
 * Saves invoice + items, increases local stock, syncs WC products/batch.
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
    invoiceNumber?: string | null;
    date?: string | null;
    paidAmount?: number;
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
    const result = await createPurchaseInvoice({
      supplierId: Number(body.supplierId),
      invoiceNumber: body.invoiceNumber,
      date: body.date,
      paidAmount: body.paidAmount,
      items: (body.items ?? []).map((row) => ({
        productId: String(row.productId ?? ""),
        quantity: Number(row.quantity),
        unitCost: Number(row.unitCost),
      })),
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
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
    console.error("[api/purchases/create]", error);
    return NextResponse.json({ error: "Could not create purchase" }, { status: 500 });
  }
}
