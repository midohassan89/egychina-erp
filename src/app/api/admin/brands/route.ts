import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function serializeBrand(
  brand: {
    id: string;
    name: string;
    nameEn: string | null;
    nameZh: string | null;
    image: string | null;
  },
  productCount = 0,
) {
  return {
    id: brand.id,
    name: brand.name,
    nameEn: brand.nameEn,
    nameZh: brand.nameZh,
    image: brand.image,
    productCount,
  };
}

/** GET /api/admin/brands */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(
      {
        brands: brands.map((brand) =>
          serializeBrand(brand, brand._count.products),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/admin/brands]", error);
    return NextResponse.json(
      { error: "Could not load brands" },
      { status: 500 },
    );
  }
}

/** POST /api/admin/brands */
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
    const brand = await prisma.brand.create({
      data: {
        name,
        nameEn: blankToNull(body.nameEn),
        nameZh: blankToNull(body.nameZh),
        image: blankToNull(body.image),
      },
    });
    return NextResponse.json({ brand: serializeBrand(brand) });
  } catch {
    return NextResponse.json(
      { error: "A brand with this name already exists" },
      { status: 409 },
    );
  }
}
