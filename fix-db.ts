import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Legacy storefront orders stored Arabic labels in Order.status.
 * Prisma now expects the OrderStatus enum, so those rows must be rewritten
 * before generate/build can read the table.
 *
 * SQLite and PostgreSQL both accept double-quoted identifiers.
 */
const STATUS_MAP: Array<{ from: string; to: string }> = [
  { from: "مكتمل", to: "COMPLETED" },
  { from: "قيد الانتظار", to: "PENDING" },
  { from: "جاري التجهيز", to: "PREPARING" },
  { from: "ملغي", to: "CANCELLED" },
];

async function main() {
  for (const { from, to } of STATUS_MAP) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "Order" SET status = '${to}' WHERE status = '${from}'`,
    );
    console.log(`${from} -> ${to}: ${updated} row(s)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
