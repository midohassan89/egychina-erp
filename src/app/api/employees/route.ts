import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { serializeEmployee } from "@/lib/hr/serialize";

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
    include: {
      transactions: {
        select: { type: true, amount: true, expenseId: true },
      },
    },
  });

  return NextResponse.json({ employees: employees.map(serializeEmployee) });
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

  let body: {
    name?: string;
    baseSalary?: number;
    hireDate?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) {
    return NextResponse.json({ error: "Employee name is required" }, { status: 400 });
  }

  const baseSalary = Number(body.baseSalary ?? 0);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) {
    return NextResponse.json(
      { error: "baseSalary must be 0 or greater" },
      { status: 400 },
    );
  }

  let hireDate = new Date();
  if (body.hireDate) {
    const parsed = new Date(body.hireDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid hireDate" }, { status: 400 });
    }
    hireDate = parsed;
  }

  const employee = await prisma.employee.create({
    data: {
      name,
      isActive: true,
      baseSalary,
      hireDate,
    },
    include: {
      transactions: {
        select: { type: true, amount: true, expenseId: true },
      },
    },
  });

  return NextResponse.json({ ok: true, employee: serializeEmployee(employee) });
}

/** PATCH /api/employees — Admin updates staff (active, salary, hire date, name). */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    id?: number;
    isActive?: boolean;
    name?: string;
    baseSalary?: number;
    hireDate?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const data: {
    isActive?: boolean;
    name?: string;
    baseSalary?: number;
    hireDate?: Date;
  } = {};

  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) {
      return NextResponse.json({ error: "Employee name is required" }, { status: 400 });
    }
    data.name = name;
  }
  if (body.baseSalary !== undefined) {
    const baseSalary = Number(body.baseSalary);
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      return NextResponse.json(
        { error: "baseSalary must be 0 or greater" },
        { status: 400 },
      );
    }
    data.baseSalary = baseSalary;
  }
  if (body.hireDate !== undefined && body.hireDate !== null) {
    const parsed = new Date(body.hireDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid hireDate" }, { status: 400 });
    }
    data.hireDate = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const employee = await prisma.employee.update({
    where: { id },
    data,
    include: {
      transactions: {
        select: { type: true, amount: true, expenseId: true },
      },
    },
  });

  return NextResponse.json({ ok: true, employee: serializeEmployee(employee) });
}
