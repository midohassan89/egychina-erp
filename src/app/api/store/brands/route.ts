import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** GET /api/store/brands — public brand list for the storefront. */
export async function GET() {
  try {
    const brands = await prisma.brand.findMany({
      select: {
        id: true,
        name: true,
        nameEn: true,
        nameZh: true,
        image: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(brands, { headers: corsHeaders });
  } catch (error) {
    console.error("[api/store/brands]", error);
    return NextResponse.json(
      { error: "Could not load brands" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
