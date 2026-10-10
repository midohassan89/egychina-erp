import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

/**
 * GET /api/customers/[id]/orders
 * Order history for a customer. Order.customerId already relates to Customer.
 * Auth: STORE_API_KEY or a manager/admin session.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = requireStoreApiKey(request) ? null : await auth();
  if (
    !requireStoreApiKey(request) &&
    (!session?.user || !isManagerOrAdmin(session.user.role))
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json(
      { error: "Customer not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const orders = await prisma.order.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
  });

  return NextResponse.json(
    {
      ok: true,
      orders: orders.map((order) => ({
        id: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        phone: order.phone,
        address: order.address,
        notes: order.notes,
        totalAmount: order.totalAmount,
        status: order.status,
        pointsEarned: order.pointsEarned,
        pointsRedeemed: order.pointsRedeemed,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          imageUrl: item.product.imageUrl,
          quantity: item.quantity,
          price: item.price,
        })),
      })),
    },
    { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
