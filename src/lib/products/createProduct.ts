import { prisma } from "@/lib/prisma";
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
  price: number;
  salePrice?: number | null;
  barcode: string;
  stockQuantity?: number;
  stockStatus?: "instock" | "outofstock";
  /** Virtual bundle: Prisma id of the base single unit. */
  linkedProductId?: string | null;
  /** Units of the base product consumed per bundle sold. */
  bundleMultiplier?: number | null;
  categoryId?: string | null;
  /** Local path returned by /api/admin/upload, e.g. /uploads/products/file.jpg */
  imageUrl?: string | null;
}

export async function isBarcodeTaken(barcode: string): Promise<boolean> {
  const normalized = barcode.trim();
  if (!normalized) return false;
  const existing = await prisma.product.findFirst({
    where: { barcode: normalized },
    select: { id: true },
  });
  return Boolean(existing);
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

  let linkedProductId: string | null = null;
  let bundleMultiplier: number | null = null;
  const linkedRaw =
    input.linkedProductId != null ? String(input.linkedProductId).trim() : "";
  const isBundle = Boolean(linkedRaw);

  if (isBundle) {
    const mult = Math.floor(Number(input.bundleMultiplier));
    if (!Number.isFinite(mult) || mult < 1) {
      throw new CreateProductError(
        "Bundle multiplier must be a positive integer (e.g. 3)",
        400,
      );
    }
    const base = await prisma.product.findFirst({
      where: { id: linkedRaw, isDeleted: false },
      select: { id: true, linkedProductId: true, name: true },
    });
    if (!base) {
      throw new CreateProductError("Linked base product not found", 404);
    }
    if (base.linkedProductId) {
      throw new CreateProductError(
        "Cannot link a bundle to another virtual bundle — pick a single unit",
        400,
      );
    }
    linkedProductId = base.id;
    bundleMultiplier = mult;
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

  const imageUrl = localProductImagePath(input.imageUrl);

  // Virtual bundles never hold their own inventory
  const stockQuantity = isBundle
    ? 0
    : Math.max(
        0,
        Math.floor(
          Number.isFinite(input.stockQuantity)
            ? (input.stockQuantity as number)
            : 0,
        ),
      );
  const stockStatus = isBundle
    ? "instock"
    : input.stockStatus === "outofstock"
      ? "outofstock"
      : "instock";

  const latest = await prisma.product.findFirst({
    orderBy: { wcId: "desc" },
    select: { wcId: true },
  });
  const wcId = (latest?.wcId ?? 0) + 1;

  const product = await prisma.product.create({
    data: {
      wcId,
      name,
      barcode,
      price: input.price,
      salePrice,
      stockQuantity,
      stockStatus,
      imageUrl,
      isDeleted: false,
      linkedProductId,
      bundleMultiplier,
      categoryId,
    },
  });

  return serializeAdminProduct(product);
}
