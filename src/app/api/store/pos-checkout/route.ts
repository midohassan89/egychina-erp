import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CommitPosCheckoutError,
  commitPosCheckout,
} from "@/lib/pos/commitPosCheckout";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";
import { isStaffMealPayment } from "@/lib/pos/paymentMethods";
import type { PaymentMethod } from "@/types/woocommerce";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * POST /api/store/pos-checkout
 * Desktop till sales upload without device Bearer (same trust model as live catalog).
 * Idempotent on `localId` via commitPosCheckout.
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    let body: {
      paymentMethod?: PaymentMethod;
      amount?: number;
      isReturn?: boolean;
      shiftId?: string | number | null;
      cashierUserId?: string | null;
      localId?: string | null;
      total?: number;
      customerName?: string | null;
      employeeId?: number | null;
      customerId?: string | null;
      pointsEarned?: number;
      pointsRedeemed?: number;
      createdAt?: string | null;
      wooOrderId?: number | null;
      lines?: {
        productId?: number;
        name?: string;
        nameZh?: string | null;
        qty?: number;
        unitPrice?: number;
        lineTotal?: number;
        stockMultiplier?: number;
      }[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders },
      );
    }

    const paymentMethod = body.paymentMethod ?? "cash";
    if (isStaffMealPayment(paymentMethod)) {
      return NextResponse.json(
        { error: "Staff meals require a staff session" },
        { status: 400, headers: corsHeaders },
      );
    }

    const owner = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        role: { in: ["ADMIN", "MANAGER"] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "No active ADMIN/MANAGER to attribute the sale" },
        { status: 500, headers: corsHeaders },
      );
    }

    const resolvedCashier = await resolveCashierUserId(
      body.cashierUserId,
      owner.id,
    );
    if (resolvedCashier.error || !resolvedCashier.userId) {
      return NextResponse.json(
        { error: resolvedCashier.error ?? "Invalid cashier" },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await commitPosCheckout({
      userId: resolvedCashier.userId,
      body,
      staffEmployee: null,
    });

    return NextResponse.json(
      { ...result, authKind: "store-pos" },
      { headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof CommitPosCheckoutError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders },
      );
    }
    console.error("[api/store/pos-checkout]", error);
    return NextResponse.json(
      { error: "Could not save sale" },
      { status: 500, headers: corsHeaders },
    );
  }
}
