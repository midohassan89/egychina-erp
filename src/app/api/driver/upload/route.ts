import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver/auth";
import { saveCompressedDriverImage } from "@/lib/driver/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/driver/upload
 * Compress (max 800px wide, JPEG 70%) and store under /uploads/expenses.
 * multipart field: image | file
 */
export async function POST(request: Request) {
  const driver = await requireDriver(request);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image") ?? formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }
    const blob = file as Blob;
    if (!blob.size) {
      return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
    }

    const url = await saveCompressedDriverImage(
      Buffer.from(await blob.arrayBuffer()),
      driver.id,
    );

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("[api/driver/upload]", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
