import { prisma } from "@/lib/prisma";
import {
  assertPackageBarcodesFree,
  normalizeProductPackages,
  packageUniqueMessage,
  PackageInputError,
} from "@/lib/products/packages";
import { serializeAdminProduct } from "@/lib/products/productService";

export class CreateProductError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "CreateProductError";
  }
}

export interface CreateProductInput {
  name: string;
  nameEn?: string | null;
  nameZh?: string | null;
  price: number;
  salePrice?: number | null;
  barcode: string;
  sku?: string | null;
  stockQuantity?: number;
  stockStatus?: "instock" | "outofstock";
  isWeighed?: boolean;
  isActive?: boolean;
  categoryId?: string | null;
  brandId?: string | null;
  /** Local path returned by /api/admin/upload, e.g. /uploads/products/file.jpg */
  imageUrl?: string | null;
  /** Alternate carton/shrink barcodes. Omitted or empty means none. */
  packages?: unknown;
}

export async function isBarcodeTaken(barcode: string): Promise<boolean> {
  const normalized = barcode.trim();
  if (!normalized) return false;
  const [existing, packageHit] = await Promise.all([
    prisma.product.findFirst({
      where: { barcode: normalized },
      select: { id: true },
    }),
    prisma.productPackage.findFirst({
      where: { barcode: normalized },
      select: { id: true },
    }),
  ]);
  return Boolean(existing || packageHit);
}

function localProductImagePath(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (!value.startsWith("/uploads/products/") || value.includes("..")) {
    throw new CreateProductError("Image must be a local upload path", 400);
  }
  return value;
}

/**
 * Create a product in the local ERP database only.
 */
export async function createProductOnErpAndWoo(input: CreateProductInput) {
  const name = input.name.trim();
  if (!name) {
    throw new CreateProductError("Product name is required", 400);
  }

  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new CreateProductError("Invalid regular price", 400);
  }

  const barcode = input.barcode.trim();
  if (!barcode) {
    throw new CreateProductError("Barcode is required", 400);
  }

  let salePrice: number | null = null;
  if (input.salePrice != null && input.salePrice !== undefined) {
    if (!Number.isFinite(input.salePrice) || input.salePrice < 0) {
      throw new CreateProductError("Invalid sale price", 400);
    }
    if (input.salePrice > 0) {
      if (input.salePrice >= input.price) {
        throw new CreateProductError(
          "Sale price must be less than the regular price",
          400,
        );
      }
      salePrice = input.salePrice;
    }
  }

  if (await isBarcodeTaken(barcode)) {
    throw new CreateProductError("This barcode already exists", 409);
  }

  let categoryId: string | null = null;
  const categoryRaw = input.categoryId?.trim() ?? "";
  if (categoryRaw) {
    const category = await prisma.category.findUnique({
      where: { id: categoryRaw },
      select: { id: true },
    });
    if (!category) {
      throw new CreateProductError("Category not found", 400);
    }
    categoryId = category.id;
  }

  let brandId: string | null = null;
  const brandRaw = input.brandId?.trim() ?? "";
  if (brandRaw) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandRaw },
      select: { id: true },
    });
    if (!brand) {
      throw new CreateProductError("Brand not found", 400);
    }
    brandId = brand.id;
  }

  const imageUrl = localProductImagePath(input.imageUrl);

  let packages: ReturnType<typeof normalizeProductPackages> = [];
  if (input.packages !== undefined) {
    try {
      packages = normalizeProductPackages(input.packages);
      await assertPackageBarcodesFree(packages, { productBarcode: barcode });
    } catch (error) {
      if (error instanceof PackageInputError) {
        throw new CreateProductError(error.message, 400);
      }
      throw error;
    }
  }

  const stockQuantity = Math.max(
    0,
    Math.floor(
      Number.isFinite(input.stockQuantity) ? (input.stockQuantity as number) : 0,
    ),
  );
  const stockStatus =
    input.stockStatus === "outofstock" ? "outofstock" : "instock";

  const latest = await prisma.product.findFirst({
    orderBy: { wcId: "desc" },
    select: { wcId: true },
  });
  const wcId = (latest?.wcId ?? 0) + 1;

  try {
    const product = await prisma.product.create({
      data: {
        wcId,
        name,
        nameEn: input.nameEn?.trim() || null,
        nameZh: input.nameZh?.trim() || null,
        barcode,
        sku: input.sku?.trim() || null,
        price: input.price,
        salePrice,
        stockQuantity,
        stockStatus,
        imageUrl,
        isWeighed: Boolean(input.isWeighed),
        isActive: input.isActive !== false,
        isDeleted: false,
        categoryId,
        brandId,
        ...(packages.length > 0
          ? { packages: { create: packages } }
          : {}),
      },
      include: { packages: true },
    });

    return serializeAdminProduct(product, product.packages);
  } catch (error) {
    const unique = packageUniqueMessage(error);
    if (unique) throw new CreateProductError(unique, 409);
    throw error;
  }
}
