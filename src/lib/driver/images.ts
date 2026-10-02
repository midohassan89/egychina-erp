import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "driver-expenses");

/**
 * Compress & resize an image buffer (max width 800px, JPEG ~70% quality),
 * save under public/uploads/driver-expenses, return public URL path.
 */
export async function saveCompressedDriverImage(
  input: Buffer,
  prefix: string,
): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const filename = `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`;

  const output = await sharp(input)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(path.join(UPLOAD_DIR, filename), output);
  return `/uploads/driver-expenses/${filename}`;
}
