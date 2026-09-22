import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { roundMoney } from "@/lib/pos/money";
import {
  applyOpeningBalanceChange,
  serializeSupplier,
} from "@/lib/suppliers/balance";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/suppliers/[id] */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number((await context.params).id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid supplier id" }, { status: 400 });
  }

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  return NextResponse.json({ supplier: serializeSupplier(supplier) });
}

/**
 * PATCH /api/suppliers/[id]
 * Update name/phone (editors). openingBalance is Admin-only.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number((await context.params).id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid supplier id" }, { status: 400 });
  }

  let body: {
    name?: string;
    phone?: string | null;
    openingBalance?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const data: { name?: string; phone?: string | null } = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = name;
  }

  if (body.phone !== undefined) {
    data.phone =
      body.phone != null && String(body.phone).trim()
        ? String(body.phone).trim()
        : null;
  }

  if (body.openingBalance !== undefined) {
    if (!isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: "Only Administrators can edit opening balance" },
        { status: 403 },
      );
    }
    const raw = Number(body.openingBalance);
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json(
        { error: "Opening balance must be ≥ 0" },
        { status: 400 },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.supplier.update({ where: { id }, data });
        }
        await applyOpeningBalanceChange(tx, id, roundMoney(raw));
      });
    } catch (error) {
      console.error("[api/suppliers/[id] PATCH]", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
  } else if (Object.keys(data).length > 0) {
    await prisma.supplier.update({ where: { id }, data });
  } else {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  return NextResponse.json({
    ok: true,
    supplier: supplier ? serializeSupplier(supplier) : null,
  });
}
