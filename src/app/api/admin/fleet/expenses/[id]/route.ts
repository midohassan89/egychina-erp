import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/treasury/ensureTreasury";
import { debitPaymentSource } from "@/lib/treasury/debitPaymentSource";

const CATEGORY_LABELS: Record<string, string> = {
  FUEL: "وقود السائقين",
  TOLL: "رسوم طريق السائقين",
  OIL: "زيت / تشحيم السائقين",
  MAINTENANCE: "صيانة سيارات السائقين",
};

async function ensureExpenseCategory(
  tx: Prisma.TransactionClient,
  driverCategory: string,
) {
  const name =
    CATEGORY_LABELS[driverCategory] ?? `مصروف سائق — ${driverCategory}`;
  const existing = await tx.expenseCategory.findUnique({ where: { name } });
  if (existing) return existing;
  return tx.expenseCategory.create({ data: { name } });
}

/**
 * PATCH /api/admin/fleet/expenses/[id]
 * Body: { action: 'APPROVE' | 'PARTIAL' | 'REJECT', approvedAmount?, adminNotes? }
 * APPROVE / PARTIAL → create main Expense + debit Treasury cash.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      action?: unknown;
      approvedAmount?: unknown;
      adminNotes?: unknown;
    };
    const action = String(body.action ?? "")
      .trim()
      .toUpperCase();
    const adminNotes =
      body.adminNotes != null && String(body.adminNotes).trim()
        ? String(body.adminNotes).trim()
        : null;

    if (!["APPROVE", "PARTIAL", "REJECT"].includes(action)) {
      return NextResponse.json(
        { error: "action must be APPROVE, PARTIAL, or REJECT" },
        { status: 400 },
      );
    }

    const existing = await prisma.driverExpense.findUnique({
      where: { id },
      include: { driver: { select: { username: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only PENDING expenses can be reviewed" },
        { status: 400 },
      );
    }

    if (action === "REJECT") {
      const updated = await prisma.driverExpense.update({
        where: { id },
        data: {
          status: "REJECTED",
          adminNotes,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true, expense: updated });
    }

    let approvedAmount = roundMoney(Number(existing.amount));
    if (action === "PARTIAL") {
      approvedAmount = roundMoney(Number(body.approvedAmount));
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
        return NextResponse.json(
          { error: "approvedAmount must be greater than 0" },
          { status: 400 },
        );
      }
      if (approvedAmount > existing.amount + 0.001) {
        return NextResponse.json(
          { error: "approvedAmount cannot exceed submitted amount" },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const category = await ensureExpenseCategory(tx, existing.category);
      const notes = [
        `سائق: ${existing.driver.username}`,
        `فئة: ${existing.category}`,
        `مرجع أسطول: ${existing.id}`,
        adminNotes ? `ملاحظة: ${adminNotes}` : null,
      ]
        .filter(Boolean)
        .join(" — ");

      const mainExpense = await tx.expense.create({
        data: {
          categoryId: category.id,
          amount: approvedAmount,
          date: new Date(),
          notes,
          bankAccountId: null, // Treasury cash
        },
      });

      await debitPaymentSource(tx, {
        sourceType: "TREASURY",
        bankAccountId: null,
        amount: approvedAmount,
        reference: "EXPENSE",
        description: `Driver expense: ${existing.driver.username} — ${existing.category}`,
        date: new Date(),
      });

      const updated = await tx.driverExpense.update({
        where: { id },
        data: {
          status: action === "PARTIAL" ? "PARTIAL" : "APPROVED",
          approvedAmount,
          adminNotes,
          linkedExpenseId: mainExpense.id,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });

      return { updated, mainExpenseId: mainExpense.id };
    });

    return NextResponse.json({
      ok: true,
      expense: result.updated,
      linkedExpenseId: result.mainExpenseId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not review expense";
    const status = message.startsWith("Insufficient") ? 400 : 500;
    if (status === 500) console.error("[api/admin/fleet/expenses/[id]]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
