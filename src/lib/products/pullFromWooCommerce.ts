import { prisma } from "@/lib/prisma";
import { fetchAllPages } from "@/lib/woocommerce/client";
import type { WooCommerceMetaData, WooCommerceProduct } from "@/types/woocommerce";
import { OP_BARCODE_META_KEY } from "@/lib/pos/opBarcode";

function extractOpBarcode(meta: WooCommerceMetaData[] | undefined): string | null {
  if (!meta?.length) return null;

  for (const row of meta) {
    if (row.key !== OP_BARCODE_META_KEY && row.key !== "op_barcode") continue;
    const raw = row.value;
    if (raw == null || raw === "") continue;

    if (Array.isArray(raw)) {
      const first = raw.map(String).map((s) => s.trim()).find(Boolean);
      return first ?? null;
    }

    const text = String(raw).trim();
    if (!text) continue;

    // Prefer first token if comma/pipe separated
    const first = text.split(/[,;|]/)[0]?.trim();
    return first || null;
  }

  return null;
}

function parsePrice(value: string | undefined): number {
  const n = parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pull all published Arabic WooCommerce products into the local Prisma catalog.
 */
export async function pullProductsFromWooCommerce(): Promise<{
  upserted: number;
  total: number;
}> {
  const products = await fetchAllPages<WooCommerceProduct>("products", {
    status: "publish",
    lang: "ar",
  });

  let upserted = 0;

  for (const wc of products) {
    const barcode = extractOpBarcode(wc.meta_data);
    const imageUrl = wc.images?.[0]?.src ?? null;
    // Prefer WooCommerce regular_price for the ERP "price" field
    const price = parsePrice(wc.regular_price || wc.price);
    const saleRaw = (wc.sale_price ?? "").trim();
    const saleParsed = saleRaw ? parsePrice(saleRaw) : 0;
    const salePrice = saleParsed > 0 ? saleParsed : null;
    const stockQuantity =
      typeof wc.stock_quantity === "number" && Number.isFinite(wc.stock_quantity)
        ? wc.stock_quantity
        : 0;
    const stockStatus =
      wc.stock_status === "outofstock" ? "outofstock" : "instock";

    const existing = await prisma.product.findUnique({
      where: { wcId: wc.id },
      select: { linkedProductId: true },
    });
    const isVirtualBundle = Boolean(existing?.linkedProductId);

    await prisma.product.upsert({
      where: { wcId: wc.id },
      create: {
        wcId: wc.id,
        name: wc.name,
        sku: wc.sku?.trim() ? wc.sku.trim() : null,
        barcode,
        price,
        salePrice,
        stockQuantity,
        stockStatus,
        imageUrl,
        isDeleted: false,
      },
      update: {
        name: wc.name,
        sku: wc.sku?.trim() ? wc.sku.trim() : null,
        barcode,
        price,
        salePrice,
        // Preserve virtual-bundle inventory (stock lives on linked base unit)
        ...(isVirtualBundle ? {} : { stockQuantity, stockStatus }),
        imageUrl,
        // Do not clear soft-delete on pull
      },
    });
    upserted += 1;
  }

  return { upserted, total: products.length };
}
