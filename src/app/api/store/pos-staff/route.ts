import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * GET /api/store/pos-staff
 * Public till catalog for desktop POS (same trust model as /api/store/products).
 * Returns active staff who have a POS PIN so the till can login offline.
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["CASHIER", "ACCOUNTANT", "MANAGER", "ADMIN"] },
        pinCode: { not: null },
      },
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        pinCode: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        staff: users
          .filter(
            (u) =>
              typeof u.pinCode === "string" && /^\d{4,12}$/.test(u.pinCode),
          )
          .map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            status: u.status,
            pinCode: u.pinCode,
            updatedAt: u.updatedAt.toISOString(),
          })),
        serverTime: new Date().toISOString(),
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/pos-staff]", error);
    return NextResponse.json(
      { error: "Could not load staff" },
      { status: 500, headers: corsHeaders },
    );
  }
}
