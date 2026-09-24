import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/products/linked-virtual?baseProductId= — cartons/bundles of a base unit. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseProductId = new URL(request.url).searchParams.get("baseProductId")?.trim() ?? "";
  if (!baseProductId) {
    return NextResponse.json({ error: "baseProductId is required" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { linkedProductId: baseProductId, isDeleted: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      wcId: true,
      name: true,
      sku: true,
      price: true,
      salePrice: true,
      bundleMultiplier: true,
    },
  });

  return NextResponse.json({ products });
}
