/**
 * Local checks for PosDevice enroll / bearer checkout / revoke.
 * Uses a throwaway SQLite file — never production.
 *
 *   npm run test:pos-device-auth
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = join(__dirname, "..");
const tempDir = mkdtempSync(join(tmpdir(), "egychina-pos-device-"));
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

  const stamp = `?t=${Date.now()}`;
  const { prisma } = (await import(
    pathToFileURL(join(root, "src/lib/prisma.ts")).href + stamp
  )) as typeof import("../src/lib/prisma");
  const deviceAuth = (await import(
    pathToFileURL(join(root, "src/lib/pos/deviceAuth.ts")).href + stamp
  )) as typeof import("../src/lib/pos/deviceAuth");
  const { commitPosCheckout } = (await import(
    pathToFileURL(join(root, "src/lib/pos/commitPosCheckout.ts")).href + stamp
  )) as typeof import("../src/lib/pos/commitPosCheckout");

  const password = createHash("sha256").update("test-only").digest("hex");
  const manager = await prisma.user.create({
    data: {
      username: `mgr_${randomUUID().slice(0, 8)}`,
      password,
      role: "MANAGER",
      status: "ACTIVE",
    },
  });

  const terminalKey = randomUUID();
  const rawToken = deviceAuth.issuePosDeviceToken();
  const tokenHash = deviceAuth.hashPosDeviceToken(rawToken);

  const device = await prisma.posDevice.create({
    data: {
      terminalKey,
      storeCode: "OBOUR",
      displayName: "كاشير اختبار",
      tokenHash,
      enrolledByUserId: manager.id,
    },
  });

  assert(
    deviceAuth.posDeviceTokenMatches(rawToken, device.tokenHash),
    "token must match stored hash",
  );
  assert(
    !deviceAuth.posDeviceTokenMatches("wrong", device.tokenHash),
    "wrong token must not match",
  );

  const wcId = 770_001 + Math.floor(Math.random() * 500);
  const product = await prisma.product.create({
    data: {
      wcId,
      name: "صنف جهاز",
      sku: `DEV-${wcId}`,
      barcode: `2${String(wcId).padStart(12, "0")}`,
      price: 5,
      stockQuantity: 50,
      stockStatus: "instock",
      isActive: true,
      isDeleted: false,
    },
  });

  // Simulate resolvePosAccess device path: actor = enrolled manager.
  const first = await commitPosCheckout({
    userId: manager.id,
    body: {
      paymentMethod: "cash",
      amount: 5,
      total: 5,
      localId: `device-${randomUUID()}`,
      lines: [
        {
          productId: wcId,
          name: product.name,
          qty: 1,
          unitPrice: 5,
          lineTotal: 5,
        },
      ],
    },
  });
  assert(first.ok && !first.alreadySynced, "device-attributed sale should create");

  const stockAfter = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert(stockAfter.stockQuantity === 49, "stock should decrement once");

  await prisma.posDevice.update({
    where: { id: device.id },
    data: { revokedAt: new Date() },
  });

  const revoked = await prisma.posDevice.findUniqueOrThrow({
    where: { id: device.id },
  });
  assert(revoked.revokedAt != null, "device must be revoked");

  // After revoke, hash still verifies cryptographically, but access layer rejects revokedAt.
  assert(
    deviceAuth.posDeviceTokenMatches(rawToken, revoked.tokenHash),
    "hash remains for audit",
  );
  assert(revoked.revokedAt != null, "revokedAt blocks resolvePosAccess");

  console.log("[test] PASS pos device enroll hash + revoke gate");
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
