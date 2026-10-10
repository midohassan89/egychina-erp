import { prisma } from "@/lib/prisma";

/** Points earned for each 1 EGP of goods paid (after redemption). */
export const POINTS_EARN_RATIO_KEY = "points_earn_ratio";
/** Points required to redeem 1 EGP. */
export const POINTS_REDEEM_VALUE_KEY = "points_redeem_value";

export const DEFAULT_POINTS_EARN_RATIO = 10;
export const DEFAULT_POINTS_REDEEM_VALUE = 1000;

export interface LoyaltySettings {
  /** Points granted per 1 EGP spent. */
  pointsEarnRatio: number;
  /** Points that equal a 1 EGP discount. */
  pointsRedeemValue: number;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const rows = await prisma.storeSetting.findMany({
    where: {
      key: { in: [POINTS_EARN_RATIO_KEY, POINTS_REDEEM_VALUE_KEY] },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    pointsEarnRatio: positiveNumber(
      byKey.get(POINTS_EARN_RATIO_KEY),
      DEFAULT_POINTS_EARN_RATIO,
    ),
    pointsRedeemValue: positiveNumber(
      byKey.get(POINTS_REDEEM_VALUE_KEY),
      DEFAULT_POINTS_REDEEM_VALUE,
    ),
  };
}

export async function saveLoyaltySettings(
  input: LoyaltySettings,
): Promise<LoyaltySettings> {
  const pointsEarnRatio = input.pointsEarnRatio;
  const pointsRedeemValue = input.pointsRedeemValue;
  if (!Number.isFinite(pointsEarnRatio) || pointsEarnRatio <= 0) {
    throw new Error("points_earn_ratio must be greater than 0");
  }
  if (!Number.isFinite(pointsRedeemValue) || pointsRedeemValue <= 0) {
    throw new Error("points_redeem_value must be greater than 0");
  }

  await prisma.$transaction([
    prisma.storeSetting.upsert({
      where: { key: POINTS_EARN_RATIO_KEY },
      create: {
        key: POINTS_EARN_RATIO_KEY,
        value: String(pointsEarnRatio),
        description: "Points earned per 1 EGP spent",
      },
      update: { value: String(pointsEarnRatio) },
    }),
    prisma.storeSetting.upsert({
      where: { key: POINTS_REDEEM_VALUE_KEY },
      create: {
        key: POINTS_REDEEM_VALUE_KEY,
        value: String(pointsRedeemValue),
        description: "Points required to redeem 1 EGP",
      },
      update: { value: String(pointsRedeemValue) },
    }),
  ]);

  return { pointsEarnRatio, pointsRedeemValue };
}
