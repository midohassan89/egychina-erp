/**
 * Local integration checks for commitPosCheckout localId + stock atomicity.
 * Uses a throwaway SQLite file — never the production database.
 *
 *   npx tsx scripts/test-checkout-localid-idempotency.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = join(__dirname, "..");
const tempDir = mkdtempSync(join(tmpdir(), "egychina-checkout-idemp-"));
const dbPath = join(tempDir, "test.db");
const databaseUrl = `file:${dbPath.replace(/\\/g, "/")}`;

process.env.DATABASE_URL = databaseUrl;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`[test] temp DB ${databaseUrl}`);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  // Fresh module graph so prisma picks up DATABASE_URL.
  const prismaMod = await import(
    pathToFileURL(join(root, "src/lib/prisma.ts")).href + `?t=${Date.now()}`
  );
  const { prisma } = prismaMod as typeof import("../src/lib/prisma");
  const commitMod = await import(
    pathToFileURL(join(root, "src/lib/pos/commitPosCheckout.ts")).href +
      `?t=${Date.now()}`
  );
  const { commitPosCheckout } = commitMod as typeof import("../src/lib/pos/commitPosCheckout");

  const password = createHash("sha256").update("test-only").digest("hex");
  const user = await prisma.user.create({
    data: {
      username: `idemp_${randomUUID().slice(0, 8)}`,
      password,
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  const wcId = 880_001 + Math.floor(Math.random() * 1000);
  const product = await prisma.product.create({
    data: {
      wcId,
      name: "اختبار مخزون محلي",
      sku: `TEST-IDEMP-${wcId}`,
      barcode: `2${String(wcId).padStart(12, "0")}`,
      price: 10,
      stockQuantity: 100,
      stockStatus: "instock",
      isActive: true,
      isDeleted: false,
    },
  });

  const shift = await prisma.shift.create({
    data: {
      userId: user.id,
      startingCash: 0,
      status: "OPEN",
    },
  });

  const localId = `desktop-test-${randomUUID()}`;
  const body = {
    paymentMethod: "cash" as const,
    amount: 20,
    total: 20,
    localId,
    shiftId: shift.id,
    lines: [
      {
        productId: wcId,
        name: product.name,
        qty: 2,
        unitPrice: 10,
        lineTotal: 20,
        stockMultiplier: 1,
      },
    ],
  };

  // --- Concurrent twin posts with the same localId ---
  const [a, b] = await Promise.all([
    commitPosCheckout({ userId: user.id, body }),
    commitPosCheckout({ userId: user.id, body }),
  ]);

  assert(a.ok && b.ok, "both results should be ok");
  assert(a.saleId === b.saleId, "both posts must share one saleId");
  const createdFlags = [a.alreadySynced, b.alreadySynced];
  assert(
    createdFlags.filter((flag) => flag === false).length === 1,
    "exactly one commit should create; the other alreadySynced",
  );
  assert(
    createdFlags.includes(true),
    "loser must report alreadySynced",
  );

  const saleCount = await prisma.sale.count({ where: { localId } });
  assert(saleCount === 1, `expected 1 sale, got ${saleCount}`);

  const afterConcurrent = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert(
    afterConcurrent.stockQuantity === 98,
    `stock should drop once 100→98, got ${afterConcurrent.stockQuantity}`,
  );

  const shiftAfter = await prisma.shift.findUniqueOrThrow({
    where: { id: shift.id },
  });
  assert(
    shiftAfter.tickets === 1,
    `tickets should increment once, got ${shiftAfter.tickets}`,
  );
  assert(
    shiftAfter.cashSales === 20,
    `cashSales should be 20, got ${shiftAfter.cashSales}`,
  );

  // --- Lost 2xx then retry (sequential alreadySynced) ---
  const retry = await commitPosCheckout({ userId: user.id, body });
  assert(retry.alreadySynced === true, "retry must be alreadySynced");
  assert(retry.saleId === a.saleId, "retry must return original saleId");

  const afterRetry = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert(
    afterRetry.stockQuantity === 98,
    `retry must not move stock again, got ${afterRetry.stockQuantity}`,
  );

  const shiftRetry = await prisma.shift.findUniqueOrThrow({
    where: { id: shift.id },
  });
  assert(
    shiftRetry.tickets === 1 && shiftRetry.cashSales === 20,
    "retry must not touch shift totals again",
  );

  console.log("[test] PASS concurrent localId + lost-response retry");
  await prisma.$disconnect();
}

main()
  .catch(async (error) => {
    console.error("[test] FAIL", error);
    process.exitCode = 1;
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  })
  .finally(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
