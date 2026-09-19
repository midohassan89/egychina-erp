import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { completeStockTake } from "@/lib/inventory/completeStockTake";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/inventory/stock-take/complete
 * Apply physical count variances as MANUAL_COUNT + WC batch sync.
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
    notes?: string | null;
    items?: { productId?: string; actualQuantity?: number }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await completeStockTake({
      userId: session.user.id,
      notes: body.notes,
      items: (body.items ?? []).map((item) => ({
        productId: String(item.productId ?? ""),
        actualQuantity: Number(item.actualQuantity),
      })),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stock take failed";
    const status =
      message.startsWith("Submit") ||
      message.startsWith("Invalid") ||
      message.startsWith("Actual") ||
      message.startsWith("Product not") ||
      message.startsWith("Insufficient")
        ? 400
        : 500;
    if (status === 500) console.error("[api/inventory/stock-take/complete]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
