import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const found = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === key.toLowerCase(),
  );
  return found ? row[found] : undefined;
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function categorySlug(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii.slice(0, 60);
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `cat-${hash.toString(16)}`;
}

async function uniqueCategorySlug(name: string): Promise<string> {
  const base = categorySlug(name);
  let slug = base;
  let n = 1;
  while (
    await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

/** POST multipart field `file` — Excel product import. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload an Excel file in the file field" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "Excel file has no sheets" },
        { status: 400 },
      );
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: "" },
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Excel file has no data rows" },
        { status: 400 },
      );
    }

    const latest = await prisma.product.findFirst({
      orderBy: { wcId: "desc" },
      select: { wcId: true },
    });
    let nextWcId = (latest?.wcId ?? 0) + 1;

    const categoryCache = new Map<string, { id: string }>();
    const brandCache = new Map<string, { id: string }>();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: { row: number; name: string; reason: string }[] = [];
    let rowIndex = 0;

    for (const row of rows) {
      const excelRow = rowIndex + 2;
      try {
        const name = text(cell(row, "Name"));
        if (!name) {
          rowIndex += 1;
          continue;
        }

        const barcode = text(cell(row, "Barcode"));
        const price = Number(cell(row, "Price"));
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`Row ${excelRow} (${name}): invalid Price`);
        }

        const saleRaw = cell(row, "Sale_Price");
        const saleText = text(saleRaw);
        let salePrice: number | null = null;
        if (saleText !== "") {
          const sale = Number(saleRaw);
          if (!Number.isFinite(sale) || sale < 0) {
            throw new Error(`Row ${excelRow} (${name}): invalid Sale_Price`);
          }
          if (sale > price) {
            throw new Error(
              `Row ${excelRow} (${name}): Sale_Price cannot be greater than Price`,
            );
          }
          salePrice = sale > 0 ? sale : null;
        }

        const stockRaw = Number(cell(row, "Stock_Quantity"));
        if (!Number.isFinite(stockRaw) || stockRaw < 0) {
          throw new Error(`Row ${excelRow} (${name}): invalid Stock_Quantity`);
        }
        const stockQuantity = Math.floor(stockRaw);
        const stockStatus =
          text(cell(row, "Stock_Status")).toLowerCase() === "outofstock"
            ? "outofstock"
            : "instock";

        const catName = text(cell(row, "Category")) || "عام";
        let category = categoryCache.get(catName);
        if (!category) {
          const existing = await prisma.category.findFirst({
            where: { name: catName },
            select: { id: true },
          });
          category =
            existing ??
            (await prisma.category.create({
              data: {
                name: catName,
                nameEn: catName,
                nameZh: catName,
                slug: await uniqueCategorySlug(catName),
              },
              select: { id: true },
            }));
          categoryCache.set(catName, category);
        }

        const brandName = text(cell(row, "Brand")) || "عام";
        let brand = brandCache.get(brandName);
        if (!brand) {
          const existing = await prisma.brand.findFirst({
            where: { name: brandName },
            select: { id: true },
          });
          brand =
            existing ??
            (await prisma.brand.create({
              data: {
                name: brandName,
                nameEn: brandName,
                nameZh: brandName,
              },
              select: { id: true },
            }));
          brandCache.set(brandName, brand);
        }

        const categoryId = category.id;
        const brandId = brand.id;

        let existingProduct: { id: string } | null = null;
        if (barcode) {
          existingProduct = await prisma.product.findFirst({
            where: { barcode: String(barcode) },
            select: { id: true },
          });
        }
        if (!existingProduct && name) {
          existingProduct = await prisma.product.findFirst({
            where: { name: String(name) },
            select: { id: true },
          });
        }

        if (existingProduct) {
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              name,
              price,
              salePrice,
              stockQuantity,
              stockStatus,
              categoryId,
              brandId,
              ...(barcode ? { barcode } : {}),
            },
          });
          updatedCount += 1;
        } else {
          const wcId = nextWcId;
          nextWcId += 1;
          await prisma.product.create({
            data: {
              wcId,
              name,
              barcode: barcode || null,
              price,
              salePrice,
              stockQuantity,
              stockStatus,
              categoryId,
              brandId,
              isDeleted: false,
            },
          });
          createdCount += 1;
        }
      } catch (error) {
        skippedCount += 1;
        errors.push({
          row: excelRow,
          name: text(cell(row, "Name")) || "بدون اسم",
          reason: error instanceof Error ? error.message : "خطأ غير معروف",
        });
        console.error(`[api/admin/products/import] row ${excelRow}`, row, error);
      }
      rowIndex += 1;
    }

    return NextResponse.json({
      success: true,
      createdCount,
      updatedCount,
      skippedCount,
      errors,
    });
  } catch (error) {
    console.error("[api/admin/products/import]", error);
    const message =
      error instanceof Error ? error.message : "Product import failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
