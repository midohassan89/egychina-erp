import { NextResponse } from "next/server";
import fs from "fs";
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

/** POST /api/admin/upload — save a product image under public/uploads/products. */
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
    const file = form.get("image") ?? form.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const blob = file as File;
    if (blob.size <= 0) {
      return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
    }

    const contentType = blob.type || "image/jpeg";
    const extension = EXTENSION_BY_TYPE[contentType];
    if (!extension) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }

    const filename = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(UPLOAD_DIR, filename),
      Buffer.from(await blob.arrayBuffer()),
    );

    return NextResponse.json({ url: `/uploads/products/${filename}` });
  } catch (error) {
    console.error("[api/admin/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
