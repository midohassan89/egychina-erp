import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function serializeCategory(
  category: {
    id: string;
    name: string;
    nameEn: string | null;
    nameZh: string | null;
    slug: string;
    description: string | null;
  },
  productCount = 0,
) {
  return {
    id: category.id,
    name: category.name,
    nameEn: category.nameEn,
    nameZh: category.nameZh,
    slug: category.slug,
    description: category.description,
    productCount,
  };
}

function slugOk(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** GET /api/categories — departments with product counts. */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });

    return NextResponse.json({
      categories: categories.map((category) =>
        serializeCategory(category, category._count.products),
      ),
    });
  } catch (error) {
    console.error("[api/categories]", error);
    return NextResponse.json(
      { error: "Could not load categories" },
      { status: 500 },
    );
  }
}

/** POST /api/categories — create a department. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    name?: string;
    nameEn?: string;
    nameZh?: string;
    slug?: string;
    description?: string;
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
    const category = await prisma.category.create({
      data: {
        name,
        nameEn: blankToNull(body.nameEn),
        nameZh: blankToNull(body.nameZh),
        slug,
        description: body.description?.trim() || null,
      },
    });
    return NextResponse.json({
      category: serializeCategory(category),
    });
  } catch {
    return NextResponse.json(
      { error: "A category with this name or slug already exists" },
      { status: 409 },
    );
  }
}
