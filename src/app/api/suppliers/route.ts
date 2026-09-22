import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { roundMoney } from "@/lib/pos/money";
import { serializeSupplier } from "@/lib/suppliers/balance";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/suppliers — list suppliers */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    suppliers: suppliers.map(serializeSupplier),
  });
}

/** POST /api/suppliers — create supplier */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const phone =
    body.phone != null && String(body.phone).trim()
      ? String(body.phone).trim()
      : null;

  // Opening balance is Admin-only
  let openingBalance = 0;
  if (body.openingBalance != null && body.openingBalance !== undefined) {
    if (!isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: "Only Administrators can set opening balance" },
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
    openingBalance = roundMoney(raw);
  }

  // Total owed starts as the opening balance (prior debt from old system)
  const supplier = await prisma.supplier.create({
    data: {
      name,
      phone,
      openingBalance,
      balance: openingBalance,
    },
  });

  return NextResponse.json({
    ok: true,
    supplier: serializeSupplier(supplier),
  });
}
