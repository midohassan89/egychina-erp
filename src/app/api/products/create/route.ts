import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createProductOnErpAndWoo,
  CreateProductError,
} from "@/lib/products/createProduct";
import { WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST multipart/form-data:
 * name, price, salePrice?, barcode, stockQuantity?, stockStatus?, image?
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "");
    const price = parseFloat(String(form.get("price") ?? ""));
    const saleRaw = String(form.get("salePrice") ?? "").trim();
    const salePrice =
      saleRaw === "" ? null : parseFloat(saleRaw);
    const barcode = String(form.get("barcode") ?? "");
    const stockRaw = String(form.get("stockQuantity") ?? "0");
    const stockQuantity = parseInt(stockRaw, 10);
    const stockStatusRaw = String(form.get("stockStatus") ?? "instock");
    const stockStatus =
      stockStatusRaw === "outofstock" ? "outofstock" : "instock";

    const file = form.get("image");
    let image:
      | { buffer: Buffer; filename: string; contentType: string }
      | null = null;

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const blob = file as File;
      if (blob.size > 0) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        image = {
          buffer,
          filename: blob.name || "product.jpg",
          contentType: blob.type || "image/jpeg",
        };
      }
    }

    const product = await createProductOnErpAndWoo({
      name,
      price,
      salePrice: Number.isFinite(salePrice as number) ? salePrice : null,
      barcode,
      stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
      stockStatus,
      image,
    });

    return NextResponse.json({
      ok: true,
      product,
      message: "Product created on ERP & WooCommerce",
    });
  } catch (error) {
    if (error instanceof CreateProductError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof WooCommerceError) {
      return NextResponse.json(
        { error: error.message, endpoint: error.endpoint },
        { status: error.statusCode ?? 502 },
      );
    }
    console.error("[api/products/create]", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}
