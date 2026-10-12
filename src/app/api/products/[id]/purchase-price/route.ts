import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import { isEditor } from "@/lib/auth/roles";
import { roundMoney } from "@/lib/pos/money";
import { prisma } from "@/lib/prisma";
import {
  ProductServiceError,
  updateProductAndSync,
} from "@/lib/products/productService";

type PriceBody = {
  price?: unknown;
  salePrice?: unknown;
  buyingCost?: unknown;
};

function hasField(body: PriceBody, key: keyof PriceBody) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

/** PATCH /api/products/[id]/purchase-price — quick-edit base, sale, and purchase prices. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  let body: PriceBody;
  try {
    body = (await request.json()) as PriceBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updatePrice = hasField(body, "price");
  const updateSale = hasField(body, "salePrice");
  const updateCost = hasField(body, "buyingCost");
  if (!updatePrice && !updateSale && !updateCost) {
    return NextResponse.json({ error: "No price fields provided" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, price: true, salePrice: true, buyingCost: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let nextPrice = existing.price;
  if (updatePrice) {
    nextPrice = Number(body.price);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return NextResponse.json({ error: "السعر الأساسي غير صالح" }, { status: 400 });
    }
    nextPrice = roundMoney(nextPrice);
  }

  let nextSale: number | null = existing.salePrice;
  if (updateSale) {
    if (body.salePrice == null || String(body.salePrice).trim() === "") {
      nextSale = null;
    } else {
      const sale = Number(body.salePrice);
      if (!Number.isFinite(sale) || sale < 0) {
        return NextResponse.json({ error: "سعر التخفيض غير صالح" }, { status: 400 });
      }
      nextSale = sale > 0 ? roundMoney(sale) : null;
    }
  }

  if (nextSale != null && nextSale > nextPrice) {
    return NextResponse.json(
      { error: "سعر التخفيض لا يمكن أن يكون أكبر من السعر الأساسي" },
      { status: 400 },
    );
  }

  let nextCost = existing.buyingCost;
  if (updateCost) {
    nextCost = Number(body.buyingCost);
    if (!Number.isFinite(nextCost) || nextCost < 0) {
      return NextResponse.json({ error: "سعر الشراء غير صالح" }, { status: 400 });
    }
    nextCost = roundMoney(nextCost);
  }

  try {
    if (updatePrice || updateSale) {
      await updateProductAndSync(id, {
        ...(updatePrice ? { price: nextPrice } : {}),
        ...(updateSale ? { salePrice: nextSale } : {}),
      });
    }

    if (updateCost) {
      const latestPurchase = await prisma.purchaseInvoiceItem.findFirst({
        where: { productId: id },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: { buyingCost: nextCost },
        });
        if (latestPurchase) {
          await tx.purchaseInvoiceItem.update({
            where: { id: latestPurchase.id },
            data: { unitCost: nextCost },
          });
        }
      });
    }
  } catch (error) {
    if (error instanceof ProductServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[api/products/purchase-price]", error);
    return NextResponse.json({ error: "تعذر حفظ السعر" }, { status: 500 });
  }

  await logAuditAction(session.user.id, "UPDATE", "PRODUCT", id, {
    source: "weighed-quick-price",
    ...(updatePrice ? { price: nextPrice } : {}),
    ...(updateSale ? { salePrice: nextSale } : {}),
    ...(updateCost ? { buyingCost: nextCost } : {}),
  });

  return NextResponse.json({
    success: true,
    productId: id,
    price: nextPrice,
    salePrice: nextSale,
    buyingCost: nextCost,
    lastPurchasePrice: nextCost,
  });
}
