import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import {
  ProductServiceError,
  updateProductAndSync,
} from "@/lib/products/productService";
import { WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/products/quick-update-price
 * Updates regular and sale prices in Prisma and pushes them to WooCommerce.
 * Independent of purchase-invoice save.
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
    productId?: string;
    price?: number;
    salePrice?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const productId = String(body.productId ?? "").trim();
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Invalid regular price" }, { status: 400 });
  }

  let salePrice: number | null = null;
  if (body.salePrice != null) {
    const sale = Number(body.salePrice);
    if (!Number.isFinite(sale) || sale < 0) {
      return NextResponse.json({ error: "Invalid sale price" }, { status: 400 });
    }
    salePrice = sale > 0 ? sale : null;
  }

  try {
    const product = await updateProductAndSync(productId, {
      price,
      salePrice,
    });
    await logAuditAction(session.user.id, "UPDATE", "PRODUCT", productId, {
      source: "purchase-quick-price",
      price: product.price,
      salePrice: product.salePrice,
    });
    return NextResponse.json({
      ok: true,
      productId: product.id,
      price: product.price,
      salePrice: product.salePrice,
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
        { error: error.message },
        { status: error.statusCode ?? 502 },
      );
    }
    console.error("[api/products/quick-update-price]", error);
    return NextResponse.json({ error: "Price update failed" }, { status: 500 });
  }
}
