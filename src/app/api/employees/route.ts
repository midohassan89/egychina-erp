import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";

function serialize(employee: {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: employee.id,
    name: employee.name,
    isActive: employee.isActive,
    createdAt: employee.createdAt.toISOString(),
  };
}

/** GET /api/employees — active staff by default. `?all=1` includes inactive (admin). */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("all") === "1";
  if (includeInactive && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({ employees: employees.map(serialize) });
}

/** POST /api/employees — Admin adds a staff member. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) {
    return NextResponse.json({ error: "Employee name is required" }, { status: 400 });
  }

  const employee = await prisma.employee.create({
    data: { name, isActive: true },
  });

  return NextResponse.json({ ok: true, employee: serialize(employee) });
}

/** PATCH /api/employees — Admin activates or hides a staff member. */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { id?: number; isActive?: boolean };
  try {
    body = (await request.json()) as { id?: number; isActive?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive is required" }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: { isActive: body.isActive },
  });

  return NextResponse.json({ ok: true, employee: serialize(employee) });
}
