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

interface PriceUpdate {
  productId?: string;
  price?: number;
  salePrice?: number | null;
}

/** POST /api/products/bulk-update-prices — Prisma + WooCommerce for many products. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { updates?: PriceUpdate[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ error: "Add at least one price update" }, { status: 400 });
  }

  const saved: { productId: string; price: number; salePrice: number | null }[] = [];
  const errors: { productId: string; error: string }[] = [];

  for (const row of updates) {
    const productId = String(row.productId ?? "").trim();
    if (!productId) {
      errors.push({ productId: "", error: "productId is required" });
      continue;
    }
    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ productId, error: "Invalid regular price" });
      continue;
    }
    let salePrice: number | null = null;
    if (row.salePrice != null) {
      const sale = Number(row.salePrice);
      if (!Number.isFinite(sale) || sale < 0) {
        errors.push({ productId, error: "Invalid sale price" });
        continue;
      }
      salePrice = sale > 0 ? sale : null;
    }
    if (salePrice != null && salePrice > price) {
      errors.push({
        productId,
        error: "Sale price must be less than or equal to the regular price",
      });
      continue;
    }

    try {
      const product = await updateProductAndSync(productId, { price, salePrice });
      await logAuditAction(session.user.id, "UPDATE", "PRODUCT", productId, {
        source: "bulk-update-prices",
        price: product.price,
        salePrice: product.salePrice,
      });
      saved.push({
        productId: product.id,
        price: product.price,
        salePrice: product.salePrice,
      });
    } catch (error) {
      const message =
        error instanceof ProductServiceError || error instanceof WooCommerceError
          ? error.message
          : "Price update failed";
      errors.push({ productId, error: message });
    }
  }

  if (saved.length === 0) {
    return NextResponse.json(
      { error: errors[0]?.error ?? "Price update failed", errors },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: errors.length === 0, saved, errors });
}
