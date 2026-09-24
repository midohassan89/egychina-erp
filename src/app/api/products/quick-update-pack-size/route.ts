import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/products/quick-update-pack-size
 * Remembers how many pieces are in one supplier carton. Local only.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { productId?: string; purchasePackSize?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const productId = String(body.productId ?? "").trim();
  const purchasePackSize = Math.floor(Number(body.purchasePackSize));
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!Number.isFinite(purchasePackSize) || purchasePackSize < 1) {
    return NextResponse.json(
      { error: "Pack size must be a whole number of at least 1" },
      { status: 400 },
    );
  }

  const existing = await prisma.product.findFirst({
    where: { id: productId, isDeleted: false },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: { purchasePackSize },
    select: { id: true, purchasePackSize: true },
  });

  return NextResponse.json({ ok: true, product });
}
