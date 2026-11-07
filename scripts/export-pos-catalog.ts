/**
 * Export the POS full-catalog JSON shape (same as GET /api/products without page)
 * for offline import into EgyChina Desktop POS.
 *
 *   npx tsx scripts/export-pos-catalog.ts [out.json]
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { expandPosCatalog } from "../src/lib/products/mapProduct";

const outPath = resolve(
  process.argv[2] ??
    resolve(process.cwd(), "../EgyChina-Desktop-POS/.tmp/erp-catalog.json"),
);

async function main() {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        wcId: true,
        name: true,
        nameEn: true,
        nameZh: true,
        sku: true,
        barcode: true,
        price: true,
        salePrice: true,
        stockQuantity: true,
        stockStatus: true,
        imageUrl: true,
        isFavorite: true,
        isWeighed: true,
        linkedProductId: true,
        bundleMultiplier: true,
        updatedAt: true,
        packages: {
          select: {
            id: true,
            barcode: true,
            name: true,
            nameEn: true,
            nameZh: true,
            packSize: true,
            price: true,
            isFavorite: true,
          },
        },
      },
    });

    const expanded = products.flatMap((product) =>
      expandPosCatalog(product, product.packages),
    );

    const payload = {
      serverTime: new Date().toISOString(),
      products: expanded,
      removedPrismaIds: [] as string[],
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload), "utf8");
    console.log(
      JSON.stringify({
        ok: true,
        outPath,
        baseProducts: products.length,
        posCards: expanded.length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
