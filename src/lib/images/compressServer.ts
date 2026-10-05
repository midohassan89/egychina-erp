import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");
const MAX_DIMENSION = 800;
const WEBP_QUALITY = 70;

/**
 * Compress & convert an image buffer to WebP (max 800px, quality 70),
 * save under public/uploads/products, return public URL path.
 */
export async function saveCompressedProductImage(
  input: Buffer,
  prefix = "product",
): Promise<string> {
  if (!input.length) {
    throw new Error("Empty image buffer");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "") || "product";
  const filename = `${safePrefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.webp`;

  const output = await sharp(input)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  await fs.writeFile(path.join(UPLOAD_DIR, filename), output);
  return `/uploads/products/${filename}`;
}
