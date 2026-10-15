/**
 * One-off migration: virtual bundle products -> ProductPackage rows.
 *
 * A dummy product is any Product with linkedProductId set. This schema has
 * no isBundle column. Names are copied exactly (name, nameEn, nameZh).
 *
 * Run only after `npx prisma db push` has added ProductPackage.nameEn and
 * ProductPackage.nameZh:
 *   npx tsx scripts/migrate-bundles.ts
 *
 * Historical invoice, sale, return, adjustment, opening-balance, and order
 * lines are repointed at the base product. Quantities and prices are left
 * as they were recorded.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const prisma = new PrismaClient();

type DummyPackage = { id: string; barcode: string; packSize: number };

type DummyProduct = {
  id: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  barcode: string | null;
  price: number;
  stockQuantity: number;
  imageUrl: string | null;
  linkedProductId: string | null;
  bundleMultiplier: number | null;
  packages: DummyPackage[];
};

function localImageFile(imageUrl: string | null): string | null {
  if (!imageUrl?.startsWith("/uploads/products/") || imageUrl.includes("..")) {
    return null;
  }
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads", "products");
  const file = path.resolve(process.cwd(), "public", imageUrl.replace(/^\//, ""));
  if (file !== uploadsRoot && !file.startsWith(uploadsRoot + path.sep)) {
    return null;
  }
  return file;
}

async function main() {
  const dummies = await prisma.product.findMany({
    where: { linkedProductId: { not: null } },
    include: {
      packages: { select: { id: true, barcode: true, packSize: true } },
    },
  });

  if (dummies.length === 0) {
    console.log(
      "No dummy products (linkedProductId is not null). Nothing to migrate.",
    );
    return;
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      barcode: true,
      linkedProductId: true,
      bundleMultiplier: true,
    },
  });
  const byId = new Map(products.map((row) => [row.id, row]));

  function resolve(startId: string): { baseId: string; packSize: number } {
    let current = byId.get(startId);
    if (!current) throw new Error(`Product ${startId} was not found`);
    let packSize = 1;
    const seen = new Set<string>();
    while (current.linkedProductId) {
      if (seen.has(current.id)) {
        throw new Error(`Cycle in bundle links at ${current.name}`);
      }
      seen.add(current.id);
      const multiplier = Math.floor(Number(current.bundleMultiplier));
      if (!Number.isFinite(multiplier) || multiplier < 1) {
        throw new Error(`${current.name} has no positive bundleMultiplier`);
      }
      packSize *= multiplier;
      const parent = byId.get(current.linkedProductId);
      if (!parent) {
        throw new Error(`${current.name} links to a missing product`);
      }
      current = parent;
    }
    return { baseId: current.id, packSize };
  }

  const existingPackages = await prisma.productPackage.findMany({
    select: { barcode: true, productId: true },
  });
  const packageOwner = new Map(
    existingPackages.map((row) => [row.barcode, row.productId]),
  );
  const productBarcodes = new Map<string, string>();
  for (const row of products) {
    const barcode = row.barcode?.trim();
    if (barcode) productBarcodes.set(barcode, row.id);
  }

  const skipped: { id: string; name: string; reason: string }[] = [];
  const ready: {
    dummy: DummyProduct;
    baseId: string;
    packSize: number;
    barcode: string;
  }[] = [];
  const claimed = new Set<string>();

  for (const dummy of dummies) {
    try {
      const { baseId, packSize } = resolve(dummy.id);
      const barcode = dummy.barcode?.trim() ?? "";
      if (!barcode) {
        skipped.push({
          id: dummy.id,
          name: dummy.name,
          reason: "missing barcode",
        });
        continue;
      }
      if (!dummy.name.trim()) {
        skipped.push({
          id: dummy.id,
          name: dummy.name,
          reason: "missing name",
        });
        continue;
      }
      const productOwner = productBarcodes.get(barcode);
      if (productOwner && productOwner !== dummy.id) {
        skipped.push({
          id: dummy.id,
          name: dummy.name,
          reason: `barcode ${barcode} is used by another product`,
        });
        continue;
      }
      const owner = packageOwner.get(barcode);
      if (owner && owner !== baseId) {
        skipped.push({
          id: dummy.id,
          name: dummy.name,
          reason: `barcode ${barcode} already belongs to another package`,
        });
        continue;
      }
      if (claimed.has(barcode)) {
        skipped.push({
          id: dummy.id,
          name: dummy.name,
          reason: `barcode ${barcode} is shared with another dummy product`,
        });
        continue;
      }
      claimed.add(barcode);
      ready.push({ dummy, baseId, packSize, barcode });
    } catch (error) {
      skipped.push({
        id: dummy.id,
        name: dummy.name,
        reason:
          error instanceof Error
            ? error.message
            : "could not resolve the base product",
      });
    }
  }

  const deleteIds = new Set(ready.map((row) => row.dummy.id));
  for (const row of skipped) {
    let current = byId.get(row.id);
    while (current?.linkedProductId && deleteIds.has(current.linkedProductId)) {
      deleteIds.delete(current.linkedProductId);
      current = byId.get(current.linkedProductId);
    }
  }

  const migrating = ready.filter((row) => deleteIds.has(row.dummy.id));
  for (const row of ready) {
    if (!deleteIds.has(row.dummy.id)) {
      skipped.push({
        id: row.dummy.id,
        name: row.dummy.name,
        reason: "kept because another bundle that links through it could not be migrated",
      });
    }
  }

  console.log(
    `Found ${dummies.length} dummy product(s). Migrating ${migrating.length}. Skipping ${skipped.length}.`,
  );
  for (const row of skipped) {
    console.warn(`SKIP ${row.name} (${row.id}): ${row.reason}`);
  }

  const imageUrls: string[] = [];

  await prisma.$transaction(
    async (tx) => {
    for (const row of migrating) {
      if (packageOwner.get(row.barcode) !== row.baseId) {
        await tx.productPackage.create({
          data: {
            productId: row.baseId,
            barcode: row.barcode,
            name: row.dummy.name,
            nameEn: row.dummy.nameEn,
            nameZh: row.dummy.nameZh,
            packSize: row.packSize,
            price: row.dummy.price,
          },
        });
        packageOwner.set(row.barcode, row.baseId);
      }

      for (const pkg of row.dummy.packages) {
        await tx.productPackage.update({
          where: { id: pkg.id },
          data: {
            productId: row.baseId,
            packSize: pkg.packSize * row.packSize,
          },
        });
      }

      const fromId = row.dummy.id;
      const toId = row.baseId;
      await tx.purchaseInvoiceItem.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });
      await tx.purchaseReturnItem.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });
      await tx.adjustmentItem.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });
      await tx.openingBalanceItem.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });
      await tx.saleLine.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });
      await tx.orderItem.updateMany({
        where: { productId: fromId },
        data: { productId: toId },
      });

      if (row.dummy.stockQuantity > 0) {
        await tx.product.update({
          where: { id: toId },
          data: {
            stockQuantity: {
              increment: row.dummy.stockQuantity * row.packSize,
            },
          },
        });
        console.log(
          `STOCK ${row.dummy.name}: moved ${row.dummy.stockQuantity} × ${row.packSize} onto ${toId}`,
        );
      }

      if (row.dummy.imageUrl) imageUrls.push(row.dummy.imageUrl);
      console.log(
        `PACKAGE ${row.barcode} -> base ${toId} packSize=${row.packSize} name=${JSON.stringify(row.dummy.name)} nameEn=${JSON.stringify(row.dummy.nameEn)} nameZh=${JSON.stringify(row.dummy.nameZh)}`,
      );
    }

    if (deleteIds.size > 0) {
      await tx.product.deleteMany({ where: { id: { in: [...deleteIds] } } });
    }
  },
  { timeout: 120_000 },
  );

  for (const imageUrl of imageUrls) {
    const stillUsed = await prisma.product.count({ where: { imageUrl } });
    if (stillUsed > 0) continue;
    const file = localImageFile(imageUrl);
    if (!file) continue;
    try {
      await fs.unlink(file);
      console.log(`Deleted image ${imageUrl}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.warn(
          `Could not delete ${imageUrl}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  console.log(`Deleted ${deleteIds.size} dummy product(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
