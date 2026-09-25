import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");

function extensionFromUrl(imageUrl: string): string {
  try {
    const raw = path.extname(new URL(imageUrl).pathname).toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(raw)) return raw;
  } catch {
    // fall through to the default
  }
  return ".jpg";
}

/** GET /api/admin/migrate-images — download up to 50 external product images locally. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const externalImage = { startsWith: "http" } as const;

  const [pendingCount, products] = await Promise.all([
    prisma.product.count({ where: { imageUrl: externalImage } }),
    prisma.product.findMany({
      where: { imageUrl: externalImage },
      select: { id: true, imageUrl: true },
      take: 50,
    }),
  ]);

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let processedCount = 0;

  for (const product of products) {
    const sourceUrl = product.imageUrl;
    if (!sourceUrl) continue;

    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) continue;

      const bytes = await response.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const extension = extensionFromUrl(sourceUrl);
      const filename = `product-${product.id}${extension}`;

      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: `/uploads/products/${filename}` },
      });
      processedCount += 1;
    } catch {
      // Skip broken URLs and keep going through the batch.
    }
  }

  const remainingCount = pendingCount - processedCount;

  return NextResponse.json({
    processedCount,
    remainingCount,
    message:
      remainingCount > 0
        ? `تم تحميل ${processedCount} صورة. متبقي ${remainingCount} منتج.`
        : `تم تحميل ${processedCount} صورة. لا توجد صور خارجية متبقية.`,
  });
}
