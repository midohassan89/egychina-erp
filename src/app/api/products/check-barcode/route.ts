import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBarcodeTaken } from "@/lib/products/createProduct";

/**
 * GET ?barcode=... — check local Prisma uniqueness for _op_barcode values.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const barcode = (searchParams.get("barcode") ?? "").trim();

  if (!barcode) {
    return NextResponse.json({ available: false, error: "Barcode required" }, { status: 400 });
  }

  try {
    const taken = await isBarcodeTaken(barcode);
    return NextResponse.json({
      barcode,
      available: !taken,
      taken,
    });
  } catch (error) {
    console.error("[api/products/check-barcode]", error);
    return NextResponse.json(
      { error: "Failed to check barcode" },
      { status: 500 },
    );
  }
}
