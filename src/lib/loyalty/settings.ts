import { prisma } from "@/lib/prisma";

/** Points earned for each 1 EGP of goods paid (after redemption). */
export const POINTS_EARN_RATIO_KEY = "points_earn_ratio";
/** Points required to redeem 1 EGP. */
export const POINTS_REDEEM_VALUE_KEY = "points_redeem_value";
export const POINTS_REDEEM_STEP_KEY = "points_redeem_step";
export const STORE_NAME_KEY = "store_name";
export const STORE_PHONE_KEY = "store_phone";
export const RECEIPT_FOOTER_KEY = "receipt_footer";

export const DEFAULT_POINTS_EARN_RATIO = 10;
export const DEFAULT_POINTS_REDEEM_VALUE = 1000;
/** Smallest online redemption, and the only allowed step after that. */
export const POINTS_REDEEM_STEP = 10_000;

/** Online orders may redeem 0, or 10000, 20000, 30000… points. */
export function onlinePointsRedeemError(
  points: number,
  step = POINTS_REDEEM_STEP,
): string | null {
  const minimum = Number.isInteger(step) && step > 0 ? step : POINTS_REDEEM_STEP;
  if (points === 0) return null;
  if (!Number.isInteger(points) || points < minimum || points % minimum !== 0) {
    return `Points can only be redeemed in multiples of ${minimum}, starting from ${minimum}`;
  }
  return null;
}

export interface LoyaltySettings {
  /** Points granted per 1 EGP spent. */
  pointsEarnRatio: number;
  /** Points that equal a 1 EGP discount. */
  pointsRedeemValue: number;
  /** Smallest online redemption step. Defaults to 10000. */
  pointsRedeemStep: number;
}

export interface StoreProfileSettings {
  storeName: string;
  storePhone: string;
  receiptFooter: string;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const rows = await prisma.storeSetting.findMany({
    where: {
      key: {
        in: [POINTS_EARN_RATIO_KEY, POINTS_REDEEM_VALUE_KEY, POINTS_REDEEM_STEP_KEY],
      },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const step = Math.round(
    positiveNumber(byKey.get(POINTS_REDEEM_STEP_KEY), POINTS_REDEEM_STEP),
  );
  return {
    pointsEarnRatio: positiveNumber(
      byKey.get(POINTS_EARN_RATIO_KEY),
      DEFAULT_POINTS_EARN_RATIO,
    ),
    pointsRedeemValue: positiveNumber(
      byKey.get(POINTS_REDEEM_VALUE_KEY),
      DEFAULT_POINTS_REDEEM_VALUE,
    ),
    pointsRedeemStep: step > 0 ? step : POINTS_REDEEM_STEP,
  };
}

export async function getStoreProfileSettings(): Promise<StoreProfileSettings> {
  const rows = await prisma.storeSetting.findMany({
    where: {
      key: { in: [STORE_NAME_KEY, STORE_PHONE_KEY, RECEIPT_FOOTER_KEY] },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    storeName: byKey.get(STORE_NAME_KEY) ?? "",
    storePhone: byKey.get(STORE_PHONE_KEY) ?? "",
    receiptFooter: byKey.get(RECEIPT_FOOTER_KEY) ?? "",
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

  return { pointsEarnRatio, pointsRedeemValue, pointsRedeemStep: POINTS_REDEEM_STEP };
}

export async function savePointsRedeemStep(step: number): Promise<number> {
  const pointsRedeemStep = Math.round(step);
  if (!Number.isInteger(pointsRedeemStep) || pointsRedeemStep <= 0) {
    throw new Error("points_redeem_step must be a whole number greater than 0");
  }
  await prisma.storeSetting.upsert({
    where: { key: POINTS_REDEEM_STEP_KEY },
    create: {
      key: POINTS_REDEEM_STEP_KEY,
      value: String(pointsRedeemStep),
      description: "Minimum online points redemption step",
    },
    update: { value: String(pointsRedeemStep) },
  });
  return pointsRedeemStep;
}

export async function saveStoreProfileSettings(
  input: StoreProfileSettings,
): Promise<StoreProfileSettings> {
  const storeName = input.storeName.trim().slice(0, 120);
  const storePhone = input.storePhone.trim().slice(0, 40);
  const receiptFooter = input.receiptFooter.trim().slice(0, 400);
  await prisma.$transaction([
    prisma.storeSetting.upsert({
      where: { key: STORE_NAME_KEY },
      create: { key: STORE_NAME_KEY, value: storeName, description: "Store name" },
      update: { value: storeName },
    }),
    prisma.storeSetting.upsert({
      where: { key: STORE_PHONE_KEY },
      create: {
        key: STORE_PHONE_KEY,
        value: storePhone,
        description: "Customer service phone or WhatsApp",
      },
      update: { value: storePhone },
    }),
    prisma.storeSetting.upsert({
      where: { key: RECEIPT_FOOTER_KEY },
      create: {
        key: RECEIPT_FOOTER_KEY,
        value: receiptFooter,
        description: "POS receipt footer",
      },
      update: { value: receiptFooter },
    }),
  ]);
  return { storeName, storePhone, receiptFooter };
}
