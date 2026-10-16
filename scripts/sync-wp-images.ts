/**
 * Copy local product image paths onto another database without replacing it.
 *
 * This script never deletes products or image files, and it never copies or
 * overwrites a database file. It only reads or updates Product.imageUrl on
 * the database selected by DATABASE_URL.
 *
 * Local:  npx tsx scripts/sync-wp-images.ts export
 * Live:   npx tsx scripts/sync-wp-images.ts apply
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const MANIFEST_PATH = path.join(process.cwd(), "scripts", "local-images-map.json");
const UPLOADS_ROOT = path.resolve(process.cwd(), "public", "uploads", "products");

type ImageMapEntry = {
  barcode: string | null;
  wcId: number;
  name: string;
  imageUrl: string;
  filename: string;
};

function safeUploadFile(filename: string): string | null {
  if (!filename || filename !== path.basename(filename) || filename === "." || filename === "..") {
    return null;
  }
  const file = path.resolve(UPLOADS_ROOT, filename);
  if (file !== UPLOADS_ROOT && !file.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return file;
}

function filenameFromUploadsUrl(imageUrl: string): string | null {
  let pathname = imageUrl.split("?")[0]?.split("#")[0] ?? "";
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(imageUrl).pathname;
    } catch {
      return null;
    }
  }
  const marker = "/uploads/products/";
  const at = pathname.indexOf(marker);
  if (at === -1) return null;
  return safeUploadFile(path.basename(pathname.slice(at + marker.length)))
    ? path.basename(pathname.slice(at + marker.length))
    : null;
}

function fileExists(filename: string): boolean {
  const file = safeUploadFile(filename);
  if (!file) return false;
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function uniqueIndex<T>(
  entries: T[],
  keyOf: (entry: T) => string | null,
): Map<string, T> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  const unique = new Map<string, T>();
  for (const [key, list] of groups) {
    if (list.length === 1) unique.set(key, list[0]);
  }
  return unique;
}

async function exportLocalImages(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { imageUrl: { startsWith: "/uploads/products/" } },
    select: { barcode: true, wcId: true, name: true, imageUrl: true },
  });

  const manifest: ImageMapEntry[] = [];
  for (const product of products) {
    const imageUrl = product.imageUrl;
    if (!imageUrl) continue;
    const filename = filenameFromUploadsUrl(imageUrl);
    if (!filename || !fileExists(filename)) continue;
    manifest.push({
      barcode: product.barcode,
      wcId: product.wcId,
      name: product.name,
      imageUrl: `/uploads/products/${filename}`,
      filename,
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Exported ${manifest.length} valid local product images.`);
}

function matchEntry(
  product: { barcode: string | null; wcId: number; name: string },
  byBarcode: Map<string, ImageMapEntry>,
  byWcId: Map<string, ImageMapEntry>,
  byName: Map<string, ImageMapEntry>,
): ImageMapEntry | null {
  const barcode = product.barcode?.trim();
  if (barcode) {
    const hit = byBarcode.get(barcode);
    if (hit) return hit;
  }
  const byId = byWcId.get(String(product.wcId));
  if (byId) return byId;
  return byName.get(product.name) ?? null;
}

async function applyManifest(): Promise<void> {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ImageMapEntry[];
  if (!Array.isArray(manifest)) {
    throw new Error("Manifest is not a JSON array.");
  }

  const byBarcode = uniqueIndex(manifest, (entry) => entry.barcode?.trim() || null);
  const byWcId = uniqueIndex(manifest, (entry) =>
    Number.isInteger(entry.wcId) ? String(entry.wcId) : null,
  );
  const byName = uniqueIndex(manifest, (entry) => entry.name || null);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { imageUrl: null },
        { imageUrl: "" },
        { imageUrl: "/placeholder.png" },
        { imageUrl: { contains: "wp-content" } },
        { imageUrl: { contains: "localhost" } },
      ],
    },
    select: { id: true, barcode: true, wcId: true, name: true, imageUrl: true },
  });

  let updatedFromLocalMap = 0;
  let clearedBrokenWpUrls = 0;

  for (const product of products) {
    const current = product.imageUrl;
    const alreadyLocal = current ? filenameFromUploadsUrl(current) : null;
    if (alreadyLocal && fileExists(alreadyLocal)) continue;

    const match = matchEntry(product, byBarcode, byWcId, byName);
    if (match && fileExists(match.filename)) {
      const imageUrl = `/uploads/products/${match.filename}`;
      if (current !== imageUrl) {
        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl },
        });
      }
      updatedFromLocalMap += 1;
      continue;
    }

    if (current?.includes("wp-content")) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: null },
      });
      clearedBrokenWpUrls += 1;
    }
  }

  console.log({ updatedFromLocalMap, clearedBrokenWpUrls });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "export") {
    await exportLocalImages();
    return;
  }
  if (mode === "apply") {
    await applyManifest();
    return;
  }
  throw new Error("Usage: npx tsx scripts/sync-wp-images.ts <export|apply>");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
