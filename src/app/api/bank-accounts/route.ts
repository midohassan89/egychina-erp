import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBankAccounts } from "@/lib/treasury/bankAccounts";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/bank-accounts — list accounts for payment-source dropdowns */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bankAccounts = await ensureBankAccounts(prisma);

  return NextResponse.json({
    bankAccounts: bankAccounts.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      balance: b.balance,
    })),
  });
}
