import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createInventoryAdjustment } from "@/lib/inventory/createAdjustment";
import { logAuditAction } from "@/lib/audit/logAuditAction";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/inventory/adjust
 * Save adjustment, apply stock deltas, sync WooCommerce batch.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    type?: string;
    notes?: string | null;
    date?: string | null;
    items?: {
      productId?: string;
      quantityChange?: number;
      unitCost?: number;
    }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await createInventoryAdjustment({
      type: String(body.type ?? ""),
      notes: body.notes,
      date: body.date,
      userId: session.user.id,
      items: (body.items ?? []).map((item) => ({
        productId: String(item.productId ?? ""),
        quantityChange: Number(item.quantityChange),
        unitCost:
          item.unitCost != null ? Number(item.unitCost) : undefined,
      })),
    });

    await logAuditAction(
      session.user.id,
      "CREATE",
      "INVENTORY",
      result.adjustment.id,
      {
        type: body.type,
        notes: body.notes ?? null,
        itemCount: (body.items ?? []).length,
        wooSynced: result.wooSynced,
      },
    );

    return NextResponse.json({
      ok: true,
      ...result,
      message: result.wooError
        ? `Adjustment saved locally; WooCommerce sync failed: ${result.wooError}`
        : `Adjustment #${result.adjustment.id} saved · ${result.wooSynced} products synced to WooCommerce`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Adjustment failed";
    const status =
      message.startsWith("Invalid") ||
      message.startsWith("Add at least") ||
      message.startsWith("Quantity") ||
      message.startsWith("Insufficient") ||
      message.startsWith("Product not") ||
      message.startsWith("Net quantity")
        ? 400
        : 500;
    if (status === 500) console.error("[api/inventory/adjust]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
