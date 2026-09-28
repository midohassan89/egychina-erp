import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

/** PUT /api/admin/brands/[id] */
export async function PUT(
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

  let body: {
    name?: string;
    nameEn?: string | null;
    nameZh?: string | null;
    image?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const brand = await prisma.brand.update({
      where: { id },
      data: {
        name,
        nameEn: blankToNull(body.nameEn),
        nameZh: blankToNull(body.nameZh),
        image: blankToNull(body.image),
      },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({
      brand: {
        id: brand.id,
        name: brand.name,
        nameEn: brand.nameEn,
        nameZh: brand.nameZh,
        image: brand.image,
        productCount: brand._count.products,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not update brand" },
      { status: 400 },
    );
  }
}

/** DELETE /api/admin/brands/[id] — products keep their rows with brand cleared. */
export async function DELETE(
  _request: Request,
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

  try {
    await prisma.brand.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete brand" },
      { status: 400 },
    );
  }
}
