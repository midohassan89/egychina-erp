import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");
const MAX_CANDIDATES = 5;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
};
const NO_IMAGE =
  "عفواً، لم نتمكن من جلب صورة صالحة لهذا المنتج. يرجى إضافتها يدوياً.";

function isBlockedImageUrl(imageUrl: string): boolean {
  const value = imageUrl.toLowerCase();
  return (
    value.includes("bing.com/th?") ||
    value.includes("bing.net/th?") ||
    value.includes("transparent.png") ||
    value.includes("base64")
  );
}

function bingImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  $("a.iusc").each((_, element) => {
    const raw = $(element).attr("m");
    if (!raw) return;
    try {
      const meta = JSON.parse(raw) as { murl?: string };
      const imageUrl = String(meta.murl || "").trim();
      if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
        return;
      }
      if (isBlockedImageUrl(imageUrl)) return;
      urls.push(imageUrl);
    } catch {
      // Skip a result whose metadata is not valid JSON.
    }
  });

  return urls;
}

async function downloadWebp(imageUrl: string): Promise<Buffer | null> {
  try {
    const response = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: "arraybuffer",
      timeout: 5000,
      maxContentLength: 8 * 1024 * 1024,
      maxRedirects: 3,
      headers: {
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    const input = Buffer.from(response.data);
    if (!input.length) return null;
    return await sharp(input)
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** POST /api/upload/auto-fetch — Bing Images → local WebP, first working result. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { productId?: unknown; productName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const productId = String(body.productId ?? "").trim();
  const productName = String(body.productName ?? "").trim();
  if (!productName) {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }
  if (productId) {
    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
  }

  try {
    const exactName = productName.replace(/"/g, "").trim();
    const searchUrl =
      "https://www.bing.com/images/search?q=" + encodeURIComponent(exactName);
    const searchResponse = await axios.get<string>(searchUrl, {
      responseType: "text",
      timeout: 15000,
      headers: BROWSER_HEADERS,
    });

    const candidateUrls = bingImageUrls(searchResponse.data);
    await mkdir(UPLOAD_DIR, { recursive: true });

    let attempts = 0;
    for (const imageUrl of candidateUrls) {
      if (isBlockedImageUrl(imageUrl)) continue;
      if (attempts >= MAX_CANDIDATES) break;
      attempts += 1;

      const webp = await downloadWebp(imageUrl);
      if (!webp) continue;

      const filename = `${uuid()}.webp`;
      await writeFile(path.join(UPLOAD_DIR, filename), webp);
      const url = `/uploads/products/${filename}`;

      if (productId) {
        await prisma.product.update({
          where: { id: productId },
          data: { imageUrl: url },
        });
      }

      return NextResponse.json({ success: true, url });
    }

    return NextResponse.json({ error: NO_IMAGE }, { status: 400 });
  } catch (error) {
    console.error("[api/upload/auto-fetch]", error);
    return NextResponse.json({ error: NO_IMAGE }, { status: 400 });
  }
}
