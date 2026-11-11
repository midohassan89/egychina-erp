import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CommitPosCheckoutError,
  commitPosCheckout,
} from "@/lib/pos/commitPosCheckout";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";
import { isStaffMealPayment } from "@/lib/pos/paymentMethods";
import type { PaymentMethod } from "@/types/woocommerce";

/**
 * POST /api/checkout
 * Auth: staff NextAuth session **or** enrolled desktop device Bearer token.
 * Idempotent on `localId` (see commitPosCheckout).
 */
export async function POST(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod ?? "cash";
  const isStaffMeal = isStaffMealPayment(paymentMethod);
  const isReturn = Boolean(body.isReturn);

  if (isStaffMeal && isReturn) {
    return NextResponse.json(
      { error: "Staff meals cannot be refunded as cash" },
      { status: 400 },
    );
  }

  // Device tills do not run staff-meal attribution in phase 3.
  if (isStaffMeal && access.kind === "device") {
    return NextResponse.json(
      { error: "Staff meals require a staff session" },
      { status: 400 },
    );
  }

  let staffEmployee: { id: number; name: string } | null = null;
  if (isStaffMeal) {
    const employeeId = Number(body.employeeId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { error: "Select an employee for the staff meal" },
        { status: 400 },
      );
    }
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json(
        { error: "Select an active employee" },
        { status: 400 },
      );
    }
    staffEmployee = { id: employee.id, name: employee.name };
  }

  const resolvedCashier = await resolveCashierUserId(
    body.cashierUserId,
    access.userId,
  );
  if (resolvedCashier.error || !resolvedCashier.userId) {
    return NextResponse.json(
      { error: resolvedCashier.error ?? "Invalid cashier" },
      { status: 400 },
    );
  }

  try {
    const result = await commitPosCheckout({
      userId: resolvedCashier.userId,
      body,
      staffEmployee,
    });
    return NextResponse.json({
      ...result,
      authKind: access.kind,
      ...(access.kind === "device"
        ? { deviceId: access.deviceId, terminalKey: access.terminalKey }
        : {}),
    });
  } catch (error) {
    if (error instanceof CommitPosCheckoutError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("[api/checkout]", error);
    return NextResponse.json(
      { error: "Could not save sale" },
      { status: 500 },
    );
  }
}
