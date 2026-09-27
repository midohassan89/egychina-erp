import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

interface SerpImageResult {
  original?: string;
  thumbnail?: string;
}

/** Search Google Images via SerpApi and return the first usable image URL. */
async function findImageUrl(productName: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_KEY ?? "";
  if (!apiKey) {
    throw new Error("SERPAPI_KEY is not set");
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", productName);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as {
    error?: string;
    images_results?: SerpImageResult[];
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Image search failed");
  }

  const first = body.images_results?.[0];
  const imageUrl = first?.original || first?.thumbnail || "";
  if (!imageUrl.startsWith("http")) return null;
  return imageUrl;
}

function extensionForImage(imageUrl: string, contentType: string | null): string {
  const fromType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (fromType === "image/png") return ".png";
  if (fromType === "image/webp") return ".webp";
  if (fromType === "image/gif") return ".gif";
  if (fromType === "image/jpeg") return ".jpg";

  try {
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {
    // Remote URL had no usable path; fall through to the default.
  }
  return ".jpg";
}

/** POST /api/admin/fetch-image — look up a product photo and save it locally. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      productId?: unknown;
      productName?: unknown;
    };
    const productId = String(body.productId ?? "").trim();
    const productName = String(body.productName ?? "").trim();
    if (!productId || !productName) {
      return NextResponse.json(
        { error: "productId and productName are required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const externalImageUrl = await findImageUrl(productName);
    if (!externalImageUrl) {
      return NextResponse.json(
        { error: "No image found for this product" },
        { status: 404 },
      );
    }

    const imageRes = await fetch(externalImageUrl);
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: "Could not download the image" },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "Downloaded image was empty" },
        { status: 502 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = extensionForImage(
      externalImageUrl,
      imageRes.headers.get("content-type"),
    );
    const filename = `product-${productId}-${Date.now()}${extension}`;
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);

    const localUrl = `/uploads/products/${filename}`;
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: localUrl },
    });

    return NextResponse.json({ ok: true, imageUrl: localUrl });
  } catch (error) {
    console.error("[api/admin/fetch-image]", error);
    const message =
      error instanceof Error ? error.message : "Could not fetch image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
