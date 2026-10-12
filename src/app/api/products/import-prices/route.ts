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

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const LOOKUP_CHUNK = 300;

type ImportRow = {
  row?: number;
  barcode?: string;
  sku?: string;
  price?: unknown;
  salePrice?: unknown;
  buyingCost?: unknown;
};

type MatchedProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  salePrice: number | null;
  buyingCost: number;
};

function hasField(row: ImportRow, key: "price" | "salePrice" | "buyingCost") {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function amount(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : Number.NaN;
}

async function findProducts(barcodes: string[], skus: string[]) {
  const found: MatchedProduct[] = [];
  for (let index = 0; index < barcodes.length; index += LOOKUP_CHUNK) {
    const slice = barcodes.slice(index, index + LOOKUP_CHUNK);
    if (slice.length === 0) continue;
    found.push(
      ...(await prisma.product.findMany({
        where: { isDeleted: false, barcode: { in: slice } },
        select: {
          id: true,
          name: true,
          barcode: true,
          sku: true,
          price: true,
          salePrice: true,
          buyingCost: true,
        },
      })),
    );
  }
  for (let index = 0; index < skus.length; index += LOOKUP_CHUNK) {
    const slice = skus.slice(index, index + LOOKUP_CHUNK);
    if (slice.length === 0) continue;
    found.push(
      ...(await prisma.product.findMany({
        where: { isDeleted: false, sku: { in: slice } },
        select: {
          id: true,
          name: true,
          barcode: true,
          sku: true,
          price: true,
          salePrice: true,
          buyingCost: true,
        },
      })),
    );
  }
  return found;
}

/** POST /api/products/import-prices — update prices for existing products only. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { rows?: ImportRow[] };
  try {
    body = (await request.json()) as { rows?: ImportRow[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "الملف لا يحتوي على صفوف" }, { status: 400 });
  }

  const barcodes = [
    ...new Set(rows.map((row) => String(row.barcode ?? "").trim()).filter(Boolean)),
  ];
  const skus = [
    ...new Set(rows.map((row) => String(row.sku ?? "").trim()).filter(Boolean)),
  ];
  const products = await findProducts(barcodes, skus);
  const byBarcode = new Map<string, MatchedProduct>();
  const bySku = new Map<string, MatchedProduct>();
  for (const product of products) {
    if (product.barcode && !byBarcode.has(product.barcode)) {
      byBarcode.set(product.barcode, product);
    }
    if (product.sku && !bySku.has(product.sku)) {
      bySku.set(product.sku, product);
    }
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  for (const row of rows) {
    const excelRow = Number(row.row) || 0;
    const barcode = String(row.barcode ?? "").trim();
    const sku = String(row.sku ?? "").trim();
    const label = barcode || sku || "بدون باركود";
    try {
      if (!barcode && !sku) {
        throw new Error("الصف بدون باركود أو كود صنف");
      }
      const updatePrice = hasField(row, "price");
      const updateSale = hasField(row, "salePrice");
      const updateCost = hasField(row, "buyingCost");
      if (!updatePrice && !updateSale && !updateCost) {
        throw new Error("لا توجد أسعار لتحديثها في هذا الصف");
      }

      const product = (barcode && byBarcode.get(barcode)) || (sku && bySku.get(sku));
      if (!product) {
        throw new Error("لم يتم العثور على منتج بهذا الباركود أو كود الصنف");
      }

      let nextPrice = product.price;
      if (updatePrice) {
        nextPrice = amount(row.price) ?? Number.NaN;
        if (!Number.isFinite(nextPrice) || nextPrice < 0) {
          throw new Error("السعر الأساسي غير صالح");
        }
      }

      let nextSale = product.salePrice;
      if (updateSale) {
        if (row.salePrice == null || String(row.salePrice).trim() === "") {
          nextSale = null;
        } else {
          const sale = amount(row.salePrice);
          if (sale == null || !Number.isFinite(sale) || sale < 0) {
            throw new Error("سعر التخفيض غير صالح");
          }
          nextSale = sale > 0 ? sale : null;
        }
      }
      if (nextSale != null && nextSale > nextPrice) {
        throw new Error("سعر التخفيض لا يمكن أن يكون أكبر من السعر الأساسي");
      }

      let nextCost = product.buyingCost;
      if (updateCost) {
        nextCost = amount(row.buyingCost) ?? Number.NaN;
        if (!Number.isFinite(nextCost) || nextCost < 0) {
          throw new Error("آخر سعر شراء غير صالح");
        }
      }

      if (updatePrice || updateSale) {
        await updateProductAndSync(product.id, {
          ...(updatePrice ? { price: nextPrice } : {}),
          ...(updateSale ? { salePrice: nextSale } : {}),
        });
        product.price = nextPrice;
        product.salePrice = nextSale;
      }

      if (updateCost) {
        const latestPurchase = await prisma.purchaseInvoiceItem.findFirst({
          where: { productId: product.id },
          orderBy: { id: "desc" },
          select: { id: true },
        });
        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: product.id },
            data: { buyingCost: nextCost },
          });
          if (latestPurchase) {
            await tx.purchaseInvoiceItem.update({
              where: { id: latestPurchase.id },
              data: { unitCost: nextCost },
            });
          }
        });
        product.buyingCost = nextCost;
      }

      await logAuditAction(session.user.id, "UPDATE", "PRODUCT", product.id, {
        source: "excel-price-import",
        ...(updatePrice ? { price: nextPrice } : {}),
        ...(updateSale ? { salePrice: nextSale } : {}),
        ...(updateCost ? { buyingCost: nextCost } : {}),
      });
      updatedCount += 1;
    } catch (error) {
      skippedCount += 1;
      const reason =
        error instanceof ProductServiceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "تعذر تحديث السعر";
      errors.push({ row: excelRow, name: label, reason });
    }
  }

  return NextResponse.json({
    success: true,
    updatedCount,
    skippedCount,
    errors,
  });
}
