import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

/** PATCH /api/products/[id]/status — website and app visibility. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  let body: { isActive?: unknown };
  try {
    body = (await request.json()) as { isActive?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false" }, { status: 400 });
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: body.isActive },
      select: { id: true, isActive: true },
    });
    await logAuditAction(session.user.id, "UPDATE", "PRODUCT", id, {
      source: "visibility",
      isActive: product.isActive,
    });
    return NextResponse.json({ success: true, product });
  } catch {
    return NextResponse.json({ error: "تعذر تحديث حالة العرض" }, { status: 400 });
  }
}
