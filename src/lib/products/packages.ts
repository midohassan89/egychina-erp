import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class PackageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageInputError";
  }
}

export interface ProductPackageWrite {
  barcode: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  packSize: number;
  price: number | null;
}

function optionalPackageName(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeProductPackages(raw: unknown): ProductPackageWrite[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new PackageInputError("قائمة العبوات غير صالحة");
  }

  const seen = new Set<string>();
  return raw.map((item) => {
    if (!item || typeof item !== "object") {
      throw new PackageInputError("باركود العبوة واسمها وعدد القطع مطلوبة");
    }
    const row = item as Record<string, unknown>;
    const barcode = String(row.barcode ?? "").trim();
    const name = String(row.name ?? "").trim();
    const packSize = Math.floor(Number(row.packSize));
    if (!barcode || !name || !Number.isFinite(packSize) || packSize < 1) {
      throw new PackageInputError("باركود العبوة واسمها وعدد القطع مطلوبة");
    }
    if (seen.has(barcode)) {
      throw new PackageInputError("باركود العبوة مكرر");
    }
    seen.add(barcode);

    const priceEmpty =
      row.price == null ||
      (typeof row.price === "string" && row.price.trim() === "");
    let price: number | null = null;
    if (!priceEmpty) {
      const parsed = Number(row.price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new PackageInputError("سعر العبوة غير صالح");
      }
      price = parsed;
    }

    return {
      barcode,
      name,
      nameEn: optionalPackageName(row.nameEn),
      nameZh: optionalPackageName(row.nameZh),
      packSize,
      price,
    };
  });
}

/** Package barcodes must not collide with a product barcode or another package. */
export async function assertPackageBarcodesFree(
  packages: ProductPackageWrite[],
  options: { productId?: string; productBarcode?: string | null },
) {
  const productBarcode = options.productBarcode?.trim() ?? "";
  if (
    productBarcode &&
    packages.some((row) => row.barcode === productBarcode)
  ) {
    throw new PackageInputError(
      "باركود العبوة يجب أن يختلف عن باركود المنتج",
    );
  }
  if (packages.length === 0) return;

  const barcodes = packages.map((row) => row.barcode);
  const [productHit, packageHit] = await Promise.all([
    prisma.product.findFirst({
      where: {
        barcode: { in: barcodes },
        ...(options.productId ? { id: { not: options.productId } } : {}),
      },
      select: { id: true },
    }),
    prisma.productPackage.findFirst({
      where: {
        barcode: { in: barcodes },
        ...(options.productId
          ? { productId: { not: options.productId } }
          : {}),
      },
      select: { id: true },
    }),
  ]);

  if (productHit) {
    throw new PackageInputError("باركود العبوة مستخدم لمنتج آخر");
  }
  if (packageHit) {
    throw new PackageInputError("باركود العبوة مستخدم لعبوة أخرى");
  }
}

export function packageUniqueMessage(error: unknown): string | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "باركود العبوة مستخدم بالفعل";
  }
  return null;
}
