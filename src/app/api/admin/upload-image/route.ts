import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** POST /api/admin/upload-image — save a product image and return its local path. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const blob = file as File;
    if (blob.size <= 0) {
      return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
    }

    const extension = EXTENSION_BY_TYPE[blob.type] ?? ".jpg";
    const buffer = Buffer.from(await blob.arrayBuffer());
    const filename = `upload-${Date.now()}${extension}`;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

    return NextResponse.json({
      imageUrl: `/uploads/products/${filename}`,
    });
  } catch (error) {
    console.error("[api/admin/upload-image]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
