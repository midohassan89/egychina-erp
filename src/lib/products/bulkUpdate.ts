import { prisma } from "@/lib/prisma";

export interface BulkProductRow {
  Local_ID: string;
  WooCommerce_ID: number;
  Name?: string;
  Barcode?: string | null;
  Price: number;
  Sale_Price?: number | null;
  Stock_Quantity: number;
  Stock_Status: string;
}

export class BulkUpdateError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "BulkUpdateError";
  }
}

/**
 * Update products in the local ERP database.
 */
export async function bulkUpdateProducts(rows: BulkProductRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BulkUpdateError("No products to update", 400);
  }

  const normalized = rows.map((row, index) => {
    const localId = String(row.Local_ID ?? "").trim();
    const wcId = Number(row.WooCommerce_ID);
    const price = Number(row.Price);
    const stockQuantity = Math.floor(Number(row.Stock_Quantity));
    const stockStatusRaw = String(row.Stock_Status ?? "instock")
      .trim()
      .toLowerCase();
    const stockStatus =
      stockStatusRaw === "outofstock" ? "outofstock" : "instock";

    let salePrice: number | null = null;
    const saleRaw = row.Sale_Price;
    if (saleRaw !== null && saleRaw !== undefined) {
      const sale = Number(saleRaw);
      if (Number.isFinite(sale) && sale > 0) {
        salePrice = sale;
      }
    }

    if (!localId) {
      throw new BulkUpdateError(`Row ${index + 1}: Local_ID is required`, 400);
    }
    if (!Number.isFinite(wcId) || wcId <= 0) {
      throw new BulkUpdateError(
        `Row ${index + 1}: invalid WooCommerce_ID`,
        400,
      );
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new BulkUpdateError(`Row ${index + 1}: invalid Price`, 400);
    }
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      throw new BulkUpdateError(
        `Row ${index + 1}: invalid Stock_Quantity`,
        400,
      );
    }
    if (salePrice != null && salePrice > price) {
      throw new BulkUpdateError(
        `Row ${index + 1}: Sale_Price cannot be greater than Price`,
        400,
      );
    }

    const name =
      row.Name != null && String(row.Name).trim()
        ? String(row.Name).trim()
        : undefined;
    const barcode =
      row.Barcode === undefined
        ? undefined
        : row.Barcode == null || String(row.Barcode).trim() === ""
          ? null
          : String(row.Barcode).trim();

    return {
      localId,
      wcId,
      name,
      barcode,
      price,
      salePrice,
      stockQuantity,
      stockStatus,
    };
  });

  await prisma.$transaction(
    normalized.map((row) =>
      prisma.product.update({
        where: { id: row.localId },
        data: {
          ...(row.name !== undefined ? { name: row.name } : {}),
          ...(row.barcode !== undefined ? { barcode: row.barcode } : {}),
          price: row.price,
          salePrice: row.salePrice,
          stockQuantity: row.stockQuantity,
          stockStatus: row.stockStatus,
        },
      }),
    ),
  );

  return {
    updated: normalized.length,
    wooBatches: 0,
  };
}
