import * as XLSX from "xlsx";
import type { AdminProductRow } from "@/types/adminProduct";
import type { BulkProductRow } from "@/lib/products/bulkUpdate";

export const EXCEL_COLUMNS = [
  "Local_ID",
  "Name",
  "Barcode",
  "Price",
  "Sale_Price",
  "Stock_Quantity",
  "Stock_Status",
  "Brand",
  "Category",
] as const;

export function productsToExcelRows(products: AdminProductRow[]) {
  return products.map((p) => ({
    Local_ID: p.id,
    Name: p.name,
    Barcode: p.barcode ?? "",
    Price: p.price,
    Sale_Price: p.salePrice ?? "",
    Stock_Quantity: p.stockQuantity,
    Stock_Status: p.stockStatus,
    Brand: p.brandName ?? "",
    Category: p.categoryName ?? "",
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

export const WEIGHED_EXCEL_COLUMNS = [
  "الاسم",
  "الباركود",
  "كود الصنف",
  "السعر الأساسي",
  "سعر التخفيض",
  "آخر سعر شراء",
] as const;

export function downloadWeighedProductsExcel(
  products: AdminProductRow[],
  filename = "souq-el-obour-weighed-products.xlsx",
) {
  const rows = products.map((product) => ({
    الاسم: product.name,
    الباركود: product.barcode ?? "",
    "كود الصنف": product.sku ?? "",
    "السعر الأساسي": product.price,
    "سعر التخفيض": product.salePrice ?? "",
    "آخر سعر شراء": product.lastPurchasePrice ?? product.buyingCost ?? "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...WEIGHED_EXCEL_COLUMNS],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Weighed");
  XLSX.writeFile(workbook, filename);
}

export interface PriceImportRow {
  row: number;
  barcode: string;
  sku: string;
  price?: number;
  salePrice?: number | null;
  buyingCost?: number;
}

function normHeader(key: string) {
  const trimmed = key.trim().replace(/^\uFEFF/, "");
  if (/[a-zA-Z]/.test(trimmed)) {
    return trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  }
  return trimmed;
}

function readWorkbook(fileBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(fileBuffer);
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isXls = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (!isXlsx && !isXls) {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
    return XLSX.read(text, { type: "string" });
  }
  return XLSX.read(fileBuffer, { type: "array" });
}

function headerMatch(headers: string[], names: string[]) {
  const wanted = new Set(names);
  return headers.find((header) => wanted.has(normHeader(header)));
}

function parseAmount(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const amount = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
}

/**
 * Read a price sheet. Products are matched later by barcode, then SKU.
 * Missing price columns are left unchanged. An empty discount cell clears the sale price.
 */
export function parsePriceImportSheet(fileBuffer: ArrayBuffer): PriceImportRow[] {
  const workbook = readWorkbook(fileBuffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("الملف لا يحتوي على أوراق");
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "" },
  );
  if (raw.length === 0) {
    throw new Error("الملف لا يحتوي على صفوف");
  }

  const headers = Object.keys(raw[0] ?? {});
  const barcodeKey = headerMatch(headers, ["barcode", "الباركود"]);
  const skuKey = headerMatch(headers, ["sku", "كود الصنف"]);
  const priceKey = headerMatch(headers, [
    "price",
    "base_price",
    "السعر الأساسي",
    "السعر",
  ]);
  const saleKey = headerMatch(headers, [
    "sale_price",
    "discount_price",
    "سعر التخفيض",
  ]);
  const costKey = headerMatch(headers, [
    "last_purchase_price",
    "buying_cost",
    "آخر سعر شراء",
    "اخر سعر شراء",
  ]);

  if (!barcodeKey && !skuKey) {
    throw new Error("الملف يجب أن يحتوي على عمود الباركود أو كود الصنف");
  }
  if (!priceKey && !saleKey && !costKey) {
    throw new Error("الملف يجب أن يحتوي على عمود سعر واحد على الأقل");
  }

  return raw.map((row, index) => {
    const excelRow = index + 2;
    const parsed: PriceImportRow = {
      row: excelRow,
      barcode: barcodeKey ? String(row[barcodeKey] ?? "").trim() : "",
      sku: skuKey ? String(row[skuKey] ?? "").trim() : "",
    };

    if (priceKey && String(row[priceKey] ?? "").trim() !== "") {
      const price = parseAmount(row[priceKey]);
      if (price == null || Number.isNaN(price)) {
        throw new Error(`صف ${excelRow}: السعر الأساسي غير صالح`);
      }
      parsed.price = price;
    }
    if (saleKey) {
      if (String(row[saleKey] ?? "").trim() === "") {
        parsed.salePrice = null;
      } else {
        const sale = parseAmount(row[saleKey]);
        if (sale == null || Number.isNaN(sale)) {
          throw new Error(`صف ${excelRow}: سعر التخفيض غير صالح`);
        }
        parsed.salePrice = sale;
      }
    }
    if (costKey && String(row[costKey] ?? "").trim() !== "") {
      const cost = parseAmount(row[costKey]);
      if (cost == null || Number.isNaN(cost)) {
        throw new Error(`صف ${excelRow}: آخر سعر شراء غير صالح`);
      }
      parsed.buyingCost = cost;
    }
    return parsed;
  });
}

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const found = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === key.toLowerCase(),
  );
  return found ? row[found] : undefined;
}

function columnPresent(row: Record<string, unknown>, key: string): boolean {
  if (key in row) return true;
  return Object.keys(row).some(
    (k) => k.trim().toLowerCase() === key.toLowerCase(),
  );
}

/**
 * Parse an uploaded .xlsx/.xls/.csv into bulk-update rows.
 * Brand and Category are omitted when those columns are not in the file,
 * so an older sheet does not clear existing assignments.
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

    const parsed: BulkProductRow = {
      Local_ID: localId,
      Name: name,
      Barcode: barcode,
      Price: price,
      Sale_Price: Number.isFinite(salePrice as number) ? salePrice : null,
      Stock_Quantity: stockQuantity,
      Stock_Status: stockStatus,
    };

    if (columnPresent(row, "Brand")) {
      parsed.Brand = String(cell(row, "Brand") ?? "").trim();
    }
    if (columnPresent(row, "Category")) {
      parsed.Category = String(cell(row, "Category") ?? "").trim();
    }

    return parsed;
  });
}
