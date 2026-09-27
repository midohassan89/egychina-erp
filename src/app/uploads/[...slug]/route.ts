import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".gif": "image/gif",
};

/** GET /uploads/* — read the file from disk so new uploads are served immediately. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const params = await context.params;
  const uploadRoot = path.join(process.cwd(), "public", "uploads");
  const filePath = path.resolve(path.join(uploadRoot, ...params.slug));
  const resolvedRoot = path.resolve(uploadRoot);

  if (
    filePath !== resolvedRoot &&
    !filePath.startsWith(resolvedRoot + path.sep)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const contentType =
    MIME_BY_EXT[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
