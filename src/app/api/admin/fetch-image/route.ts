import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { saveCompressedProductImage } from "@/lib/images/compressServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CANDIDATES = 5;

const NO_VALID_IMAGE_AR =
  "عفواً، لم نتمكن من جلب صورة صالحة لهذا المنتج من الإنترنت. يرجى إضافتها يدوياً.";

interface SerpImageResult {
  original?: string;
  thumbnail?: string;
}

/** Search Google Images via SerpApi and return up to 5 candidate image URLs. */
async function findImageCandidateUrls(productName: string): Promise<string[]> {
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

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const result of body.images_results ?? []) {
    for (const candidate of [result.original, result.thumbnail]) {
      const imageUrl = String(candidate ?? "").trim();
      if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
        continue;
      }
      // Skip data-URLs / HTML-ish junk that sometimes appear in results
      if (imageUrl.startsWith("data:") || /\.html?(?:\?|$)/i.test(imageUrl)) {
        continue;
      }
      if (seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      candidates.push(imageUrl);
      if (candidates.length >= MAX_CANDIDATES) {
        return candidates;
      }
    }
  }

  return candidates;
}

/**
 * Download a candidate URL and compress with sharp.
 * Returns the local path on success, or null to try the next candidate.
 */
async function tryDownloadAndCompress(
  imageUrl: string,
  prefix: string,
): Promise<string | null> {
  let imageRes: Response;
  try {
    imageRes = await fetch(imageUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        // Some CDNs reject empty/bot-like user agents
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; ERP-ImageFetcher/1.0; +https://localhost)",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return null;
  }

  if (!imageRes.ok) return null;

  const contentType = (imageRes.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !contentType.startsWith("image/")) {
    return null;
  }
  // SVG / XML often trigger sharp "XML parse error: html"
  if (
    contentType.includes("svg") ||
    contentType.includes("xml") ||
    contentType === "image/svg+xml"
  ) {
    return null;
  }

  let buffer: Buffer;
  try {
    const bytes = await imageRes.arrayBuffer();
    buffer = Buffer.from(bytes);
  } catch {
    return null;
  }

  if (!buffer.length) return null;

  // Quick reject: HTML pages mislabeled as images
  const head = buffer.subarray(0, Math.min(64, buffer.length)).toString("utf8");
  if (
    /^\s*<(!DOCTYPE|html|head|body|script|svg)\b/i.test(head) ||
    head.includes("<html")
  ) {
    return null;
  }

  try {
    return await saveCompressedProductImage(buffer, prefix);
  } catch {
    // Unsupported / corrupt format — try next candidate
    return null;
  }
}

/** POST /api/admin/fetch-image — Google Images → sharp WebP, with fallback loop. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      productId?: unknown;
      productName?: unknown;
    };
    const productId = String(body.productId ?? "").trim();
    const productName = String(body.productName ?? "").trim();
    if (!productName) {
      return NextResponse.json(
        { error: "productName is required" },
        { status: 400 },
      );
    }

    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }

    const candidates = await findImageCandidateUrls(productName);
    if (candidates.length === 0) {
      return NextResponse.json({ error: NO_VALID_IMAGE_AR }, { status: 400 });
    }

    const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, "") || "new";
    const prefix = `product-${safeId}`;

    for (const candidateUrl of candidates) {
      const localUrl = await tryDownloadAndCompress(candidateUrl, prefix);
      if (!localUrl) continue;

      if (productId) {
        await prisma.product.update({
          where: { id: productId },
          data: { imageUrl: localUrl },
        });
      }

      return NextResponse.json({
        ok: true,
        imageUrl: localUrl,
        sourceUrl: candidateUrl,
      });
    }

    return NextResponse.json({ error: NO_VALID_IMAGE_AR }, { status: 400 });
  } catch (error) {
    console.error("[api/admin/fetch-image]", error);
    const message =
      error instanceof Error ? error.message : "Could not fetch image";
    // Search-key / SerpApi config errors stay as 500; empty results already 400 above
    if (message === "SERPAPI_KEY is not set") {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ error: NO_VALID_IMAGE_AR }, { status: 400 });
  }
}
