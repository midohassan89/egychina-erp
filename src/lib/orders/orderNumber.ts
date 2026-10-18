import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export type OrderChannel = "APP" | "WEB" | "POS";

export function orderChannelFrom(value: unknown): OrderChannel {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw.startsWith("APP") || raw === "MOBILE") return "APP";
  if (raw.startsWith("POS") || raw === "CASHIER") return "POS";
  if (raw.startsWith("WEB") || raw === "SITE" || raw === "WEBSITE") return "WEB";
  return "WEB";
}

/** Next readable number for a channel: APP-1001, WEB-1001, POS-1001. */
export async function allocateOrderNumber(
  db: Db,
  channel: OrderChannel,
): Promise<string> {
  const counter = await db.orderNumberCounter.upsert({
    where: { channel },
    create: { channel, nextValue: 1002 },
    update: { nextValue: { increment: 1 } },
  });
  const issued = counter.nextValue - 1;
  return `${channel}-${issued}`;
}
