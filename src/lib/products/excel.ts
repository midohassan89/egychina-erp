import * as XLSX from "xlsx";
import type { AdminProductRow } from "@/types/adminProduct";
import type { BulkProductRow } from "@/lib/products/bulkUpdate";

export const EXCEL_COLUMNS = [
  "Local_ID",
  "WooCommerce_ID",
  "Name",
  "Barcode",
  "Price",
  "Sale_Price",
  "Stock_Quantity",
  "Stock_Status",
] as const;

export function productsToExcelRows(products: AdminProductRow[]) {
  return products.map((p) => ({
    Local_ID: p.id,
    WooCommerce_ID: p.wcId,
    Name: p.name,
    Barcode: p.barcode ?? "",
    Price: p.price,
    Sale_Price: p.salePrice ?? "",
    Stock_Quantity: p.stockQuantity,
    Stock_Status: p.stockStatus,
  }));
}

export function downloadProductsExcel(
  products: AdminProductRow[],
  filename = "souq-el-obour-products.xlsx",
) {
  const rows = productsToExcelRows(products);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...EXCEL_COLUMNS],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  XLSX.writeFile(workbook, filename);
}

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const found = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === key.toLowerCase(),
  );
  return found ? row[found] : undefined;
}

/**
 * Parse an uploaded .xlsx/.xls/.csv into bulk-update rows.
 */
export function parseProductsExcel(fileBuffer: ArrayBuffer): BulkProductRow[] {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file has no sheets");
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (raw.length === 0) {
    throw new Error("Excel file has no data rows");
  }

  return raw.map((row, index) => {
    const localId = String(cell(row, "Local_ID") ?? "").trim();
    const wcId = Number(cell(row, "WooCommerce_ID"));
    const name = String(cell(row, "Name") ?? "").trim();
    const barcodeRaw = cell(row, "Barcode");
    const barcode =
      barcodeRaw == null || String(barcodeRaw).trim() === ""
        ? null
        : String(barcodeRaw).trim();
    const price = Number(cell(row, "Price"));
    const saleRaw = cell(row, "Sale_Price");
    const salePrice =
      saleRaw === "" || saleRaw == null ? null : Number(saleRaw);
    const stockQuantity = Number(cell(row, "Stock_Quantity"));
    const stockStatus = String(cell(row, "Stock_Status") ?? "instock").trim();

    if (!localId) {
      throw new Error(`Row ${index + 2}: missing Local_ID`);
    }
    if (!Number.isFinite(wcId)) {
      throw new Error(`Row ${index + 2}: invalid WooCommerce_ID`);
    }

    return {
      Local_ID: localId,
      WooCommerce_ID: wcId,
      Name: name,
      Barcode: barcode,
      Price: price,
      Sale_Price: Number.isFinite(salePrice as number) ? salePrice : null,
      Stock_Quantity: stockQuantity,
      Stock_Status: stockStatus,
    };
  });
}
