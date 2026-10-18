import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productUnits } from "@/lib/products/units";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

async function customerFrom(request: Request, body?: { customerId?: unknown; phone?: unknown }) {
  if (!requireStoreApiKey(request)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders }) };
  const customerId = resolveCustomerIdFromRequest(request, body?.customerId);
  const phone = resolvePhoneFromRequest(request, body?.phone);
  if (!customerId && !phone) {
    return { error: NextResponse.json({ error: "customerId or phone is required" }, { status: 400, headers: corsHeaders }) };
  }
  const customer = await resolveStoreCustomer(prisma, { customerId, phone, createIfMissing: false });
  if (!customer) {
    return { error: NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders }) };
  }
  return { customer };
}

export async function GET(request: Request) {
  const found = await customerFrom(request);
  if ("error" in found) return found.error;
  const items = await prisma.wishlistItem.findMany({
    where: { customerId: found.customer.id },
    orderBy: { createdAt: "desc" },
    include: { product: { include: { packages: true } } },
  });
  return NextResponse.json({
    ok: true,
    wishlistIds: items.map((item) => item.productId),
    products: items.map((item) => ({
      id: item.product.id,
      name: item.product.name,
      nameEn: item.product.nameEn,
      nameZh: item.product.nameZh,
      price: item.product.price,
      imageUrl: item.product.imageUrl,
      barcode: item.product.barcode,
      units: productUnits(item.product.packages),
    })),
  }, { headers: corsHeaders });
}

/** POST toggles the product in the wishlist. */
export async function POST(request: Request) {
  let body: { productId?: unknown; customerId?: unknown; phone?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }
  const found = await customerFrom(request, body);
  if ("error" in found) return found.error;
  const productId = String(body.productId ?? "").trim();
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400, headers: corsHeaders });
  }
  const product = await prisma.product.findFirst({
    where: { id: productId, isDeleted: false },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404, headers: corsHeaders });
  }
  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId: found.customer.id, productId } },
  });
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, wished: false, productId }, { headers: corsHeaders });
  }
  await prisma.wishlistItem.create({
    data: { customerId: found.customer.id, productId },
  });
  return NextResponse.json({ ok: true, wished: true, productId }, { headers: corsHeaders });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  let productId = url.searchParams.get("productId")?.trim() ?? "";
  let body: { productId?: unknown; customerId?: unknown; phone?: unknown } = {};
  if (!productId) {
    try {
      body = (await request.json()) as typeof body;
      productId = String(body.productId ?? "").trim();
    } catch {
      body = {};
    }
  }
  const found = await customerFrom(request, body);
  if ("error" in found) return found.error;
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400, headers: corsHeaders });
  }
  await prisma.wishlistItem.deleteMany({
    where: { customerId: found.customer.id, productId },
  });
  return NextResponse.json({ ok: true, wished: false, productId }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
