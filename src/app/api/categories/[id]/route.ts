import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

function slugOk(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

/** PUT /api/categories/[id] — update a department, including translated names. */
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
    slug?: string;
    description?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const slug = body.slug?.trim().toLowerCase() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!slugOk(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase English letters, numbers, and hyphens" },
      { status: 400 },
    );
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        nameEn: blankToNull(body.nameEn),
        nameZh: blankToNull(body.nameZh),
        slug,
        description: body.description?.trim() || null,
      },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        nameZh: category.nameZh,
        slug: category.slug,
        description: category.description,
        productCount: category._count.products,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not update category" },
      { status: 409 },
    );
  }
}
