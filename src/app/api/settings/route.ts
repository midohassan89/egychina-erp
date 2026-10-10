import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import {
  getLoyaltySettings,
  saveLoyaltySettings,
} from "@/lib/loyalty/settings";

function requireManager(role: string | undefined) {
  return isManagerOrAdmin(role);
}

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

/** GET /api/settings — public loyalty ratios (defaults when rows are missing). */
export async function GET() {
  const loyalty = await getLoyaltySettings();
  return NextResponse.json(
    {
      points_earn_ratio: loyalty.pointsEarnRatio,
      points_redeem_value: loyalty.pointsRedeemValue,
    },
    { headers: publicHeaders },
  );
}

/** PUT /api/settings — save loyalty ratios into StoreSetting. */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireManager(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { points_earn_ratio?: unknown; points_redeem_value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const saved = await saveLoyaltySettings({
      pointsEarnRatio: Number(body.points_earn_ratio),
      pointsRedeemValue: Number(body.points_redeem_value),
    });
    return NextResponse.json({
      ok: true,
      points_earn_ratio: saved.pointsEarnRatio,
      points_redeem_value: saved.pointsRedeemValue,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
