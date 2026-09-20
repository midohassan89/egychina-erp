import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";

/**
 * Public kiosk lookup — returns only customer-safe fields
 * (name, display price, image). No cost, stock, or admin data.
 *
 * GET /api/price-checker/lookup?barcode=...
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("barcode") ?? "").trim();

  if (!raw || raw.length > 64) {
    return NextResponse.json(
      { error: "Invalid barcode", found: false },
      { status: 400 },
    );
  }

  // Optional shared token for store tablets (set PRICE_CHECKER_TOKEN in env).
  const requiredToken = process.env.PRICE_CHECKER_TOKEN?.trim();
  if (requiredToken) {
    const provided =
      request.headers.get("x-price-checker-token") ??
      searchParams.get("token") ??
      "";
    if (provided !== requiredToken) {
      return NextResponse.json({ error: "Forbidden", found: false }, { status: 403 });
    }
  }

  try {
    // Scale barcode: 20 + PLU(5) + price(5) + check
    if (/^\d{13}$/.test(raw) && raw.startsWith("20")) {
      const plu = raw.substring(2, 7);
      const priceCents = parseInt(raw.substring(7, 12), 10);
      const packPrice = roundMoney(priceCents / 100);
      const product = await findByBarcodeVariants(plu);

      if (!product || packPrice <= 0) {
        return NextResponse.json({
          found: false,
          barcode: raw,
          message: "Product not found",
        });
      }

      return NextResponse.json({
        found: true,
        barcode: raw,
        name: product.name,
        price: packPrice,
        imageUrl: product.imageUrl,
        isScale: true,
      });
    }

    const digits = raw.replace(/\D/g, "");
    const lookup = digits.length >= 8 ? digits : raw;
    const product = await findByBarcodeVariants(lookup);

    if (!product) {
      return NextResponse.json({
        found: false,
        barcode: lookup,
        message: "Product not found",
      });
    }

    const displayPrice =
      product.salePrice != null && product.salePrice > 0
        ? product.salePrice
        : product.price;

    return NextResponse.json({
      found: true,
      barcode: lookup,
      name: product.name,
      price: displayPrice,
      imageUrl: product.imageUrl,
      isScale: false,
    });
  } catch (error) {
    console.error("[api/price-checker/lookup]", error);
    return NextResponse.json(
      { error: "Lookup failed", found: false },
      { status: 500 },
    );
  }
}

async function findByBarcodeVariants(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const unpadded = trimmed.replace(/^0+/, "") || "0";
  const padded5 = unpadded.padStart(5, "0");
  const candidates = Array.from(
    new Set([trimmed, unpadded, padded5, code.replace(/\D/g, "")].filter(Boolean)),
  );

  return prisma.product.findFirst({
    where: {
      isDeleted: false,
      OR: candidates.flatMap((c) => [
        { barcode: c },
        { sku: c },
      ]),
    },
    select: {
      name: true,
      price: true,
      salePrice: true,
      imageUrl: true,
    },
  });
}
