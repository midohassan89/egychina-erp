import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { saveCompressedProductImage } from "@/lib/images/compressServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/upload-image — compress with sharp (WebP) and return local path. */
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
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const blob = file as Blob;
    if (!blob.size) {
      return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const imageUrl = await saveCompressedProductImage(buffer, "upload");

    return NextResponse.json({ ok: true, imageUrl });
  } catch (error) {
    console.error("[api/admin/upload-image]", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
