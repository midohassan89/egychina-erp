import { prisma } from "@/lib/prisma";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";
import { uploadWordPressMedia } from "@/lib/wordpress/media";
import { OP_BARCODE_META_KEY } from "@/lib/pos/opBarcode";
import { serializeAdminProduct } from "@/lib/products/productService";
import type { WooCommerceProduct } from "@/types/woocommerce";

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
  image?: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  } | null;
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

/**
 * Create product on WooCommerce (with optional WP media upload), then mirror to Prisma.
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

  let mediaId: number | undefined;
  let imageUrl: string | null = null;

  if (input.image?.buffer?.length) {
    const media = await uploadWordPressMedia(input.image);
    mediaId = media.id;
    imageUrl = media.source_url ?? null;
  }

  const stockQuantity = Math.max(
    0,
    Math.floor(
      Number.isFinite(input.stockQuantity) ? (input.stockQuantity as number) : 0,
    ),
  );
  const stockStatus =
    input.stockStatus === "outofstock" ? "outofstock" : "instock";

  const wcBody: Record<string, unknown> = {
    name,
    type: "simple",
    status: "publish",
    regular_price: String(input.price),
    sale_price: salePrice != null ? String(salePrice) : "",
    manage_stock: true,
    stock_quantity: stockQuantity,
    stock_status: stockStatus,
    meta_data: [{ key: OP_BARCODE_META_KEY, value: barcode }],
  };

  if (mediaId != null) {
    wcBody.images = [{ id: mediaId }];
  }

  let wcProduct: WooCommerceProduct;
  try {
    wcProduct = await wooCommerceFetch<WooCommerceProduct>("products", {
      method: "POST",
      body: wcBody,
    });
  } catch (error) {
    if (error instanceof WooCommerceError) throw error;
    throw new CreateProductError("Failed to create WooCommerce product", 502);
  }

  if (!wcProduct?.id) {
    throw new CreateProductError("WooCommerce did not return a product id", 502);
  }

  const product = await prisma.product.create({
    data: {
      wcId: wcProduct.id,
      name: wcProduct.name || name,
      sku: wcProduct.sku?.trim() ? wcProduct.sku.trim() : null,
      barcode,
      price: input.price,
      salePrice,
      stockQuantity,
      stockStatus,
      imageUrl: wcProduct.images?.[0]?.src ?? imageUrl,
      isDeleted: false,
    },
  });

  return serializeAdminProduct(product);
}
