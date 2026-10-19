import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
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
        ...(await publicCard(product, packPrice)),
        barcode: raw,
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

    return NextResponse.json({
      ...(await publicCard(product)),
      barcode: lookup,
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

type PublicProduct = NonNullable<Awaited<ReturnType<typeof findByBarcodeVariants>>>;

async function publicCard(product: PublicProduct, forcedPrice?: number) {
  const regular = product.price;
  const sale = product.salePrice;
  const onSale = forcedPrice == null && sale != null && sale > 0 && sale < regular;
  const displayPrice = forcedPrice ?? (onSale ? sale : regular);
  const loyalty = await getLoyaltySettings();
  return {
    found: true,
    name: product.name,
    nameEn: product.nameEn,
    nameZh: product.nameZh,
    price: displayPrice,
    regularPrice: regular,
    salePrice: onSale ? sale : null,
    savingsPercent: onSale ? Math.round(((regular - sale) / regular) * 100) : 0,
    imageUrl: product.imageUrl,
    pointsEarned: Math.max(0, Math.round(displayPrice * loyalty.pointsEarnRatio)),
    units: product.packages.map((unit) => ({
      name: unit.name,
      nameEn: unit.nameEn,
      nameZh: unit.nameZh,
      packSize: unit.packSize,
      barcode: unit.barcode,
      price: unit.price ?? roundMoney(regular * unit.packSize),
      highlighted: unit.barcode === product.matchedBarcode,
    })),
  };
}

async function findByBarcodeVariants(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const unpadded = trimmed.replace(/^0+/, "") || "0";
  const padded5 = unpadded.padStart(5, "0");
  const candidates = Array.from(
    new Set([trimmed, unpadded, padded5, code.replace(/\D/g, "")].filter(Boolean)),
  );

  const select = {
    name: true,
    nameEn: true,
    nameZh: true,
    price: true,
    salePrice: true,
    imageUrl: true,
    packages: {
      select: {
        name: true,
        nameEn: true,
        nameZh: true,
        packSize: true,
        price: true,
        barcode: true,
      },
    },
  } as const;

  const product = await prisma.product.findFirst({
    where: {
      isDeleted: false,
      OR: candidates.flatMap((c) => [{ barcode: c }, { sku: c }]),
    },
    select,
  });
  if (product) return { ...product, matchedBarcode: null as string | null };

  const pack = await prisma.productPackage.findFirst({
    where: { barcode: { in: candidates } },
    select: { barcode: true, product: { select: { ...select, isDeleted: true } } },
  });
  if (!pack || pack.product.isDeleted) return null;
  const { isDeleted: _unused, ...rest } = pack.product;
  return { ...rest, matchedBarcode: pack.barcode };
}
