import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Temporary: clear hardcoded package prices so POS can calculate them. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await prisma.productPackage.updateMany({
      where: { price: { not: null } },
      data: { price: null },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully reset prices for ${result.count} packages.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
