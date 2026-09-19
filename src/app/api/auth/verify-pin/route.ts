import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAuditAction } from "@/lib/audit/logAuditAction";

/**
 * POST /api/auth/verify-pin
 * Legacy alias — same Manager/Admin PIN check as /api/users/verify-pin.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { pin?: string; action?: string };
  try {
    body = (await request.json()) as { pin?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pin || pin.length < 4 || pin.length > 12) {
    return NextResponse.json(
      { error: "Enter a valid manager PIN" },
      { status: 400 },
    );
  }

  const manager = await prisma.user.findFirst({
    where: {
      pinCode: pin,
      status: "ACTIVE",
      role: { in: ["MANAGER", "ADMIN"] },
    },
    select: {
      id: true,
      username: true,
      role: true,
    },
  });

  if (!manager) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 403 },
    );
  }

  await logAuditAction(session.user.id, "PIN_OVERRIDE", "POS", null, {
    authorizedById: manager.id,
    authorizedBy: manager.username,
    authorizedRole: manager.role,
    cashier: session.user.name,
    action: body.action ?? "sensitive_pos_action",
  });

  return NextResponse.json({
    ok: true,
    managerId: manager.id,
    managerName: manager.username,
  });
}
