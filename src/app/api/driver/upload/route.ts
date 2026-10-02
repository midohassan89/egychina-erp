import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver/auth";
import { saveCompressedDriverImage } from "@/lib/driver/images";

export const dynamic = "force-dynamic";

/**
 * POST /api/driver/upload
 * Compress (max 800px wide, JPEG 70%) and store a driver expense photo.
 * multipart field: image | file
 */
export async function POST(request: Request) {
  const driver = await requireDriver(request);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const url = await saveCompressedDriverImage(
      Buffer.from(await blob.arrayBuffer()),
      driver.id,
    );

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("[api/driver/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
