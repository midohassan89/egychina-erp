import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { serializeEmployee, serializeTransaction } from "@/lib/hr/serialize";

/**
 * GET /api/employees/[id]
 * Employee profile + ledger + dynamic net salary.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      transactions: { orderBy: [{ date: "desc" }, { id: "desc" }] },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    employee: serializeEmployee(employee),
    transactions: employee.transactions.map(serializeTransaction),
  });
}
