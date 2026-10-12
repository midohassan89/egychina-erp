import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { CookieJar } from "tough-cookie";
import { v4 as uuid } from "uuid";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");
const BLOCKED_IMAGE_TERMS = [
  "bing.com/th?",
  "bing.net/th?",
  "transparent.png",
  "base64",
  "clipart",
  "vector",
  "pngtree",
  "freepik",
  "shutterstock",
  "cartoon",
];
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  Referer: "https://www.bing.com/",
  DNT: "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};
const NO_IMAGE =
  "عفواً، لم نتمكن من جلب صورة صالحة لهذا المنتج. يرجى إضافتها يدوياً.";
const IP_BLOCKED =
  "تم حظر عنوان IP الخاص بالخادم مؤقتاً من محرك البحث. حاول مرة أخرى بعد قليل.";

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

function isBlockedImageUrl(imageUrl: string): boolean {
  const value = imageUrl.toLowerCase();
  return BLOCKED_IMAGE_TERMS.some((term) => value.includes(term));
}

function keepImageUrl(imageUrl: string): string | null {
  const value = imageUrl.trim();
  if (!value.startsWith("http://") && !value.startsWith("https://")) return null;
  if (isBlockedImageUrl(value)) return null;
  return value;
}

function bingImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  $("a.iusc").each((_, element) => {
    const raw = $(element).attr("m");
    if (!raw) return;
    try {
      const meta = JSON.parse(raw) as { murl?: string };
      const imageUrl = keepImageUrl(String(meta.murl || ""));
      if (imageUrl) urls.push(imageUrl);
    } catch {
      // Skip a result whose metadata is not valid JSON.
    }
  });

  return urls;
}

function htmlImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $("img").each((_, element) => {
    const imageUrl = keepImageUrl($(element).attr("src") || "");
    if (imageUrl) urls.push(imageUrl);
  });
  return urls;
}

async function searchBing(query: string): Promise<string[]> {
  await client.get("https://www.bing.com/", {
    headers: BROWSER_HEADERS,
    responseType: "text",
    timeout: 15000,
  });

  const searchUrl =
    "https://www.bing.com/images/search?q=" +
    encodeURIComponent(query) +
    "&qft=+filterui:photo-photo&cc=EG&setmkt=ar-EG";
  const searchResponse = await client.get<string>(searchUrl, {
    headers: BROWSER_HEADERS,
    responseType: "text",
    timeout: 15000,
  });

  return bingImageUrls(String(searchResponse.data));
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const pageUrl =
    "https://duckduckgo.com/?q=" + encodeURIComponent(query) + "&iax=images&ia=images";
  const page = await client.get<string>(pageUrl, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: "https://duckduckgo.com/",
      "Sec-Fetch-Site": "none",
    },
    responseType: "text",
    timeout: 15000,
  });
  const html = String(page.data);
  const urls = htmlImageUrls(html);
  const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1] || "";
  const dp = html.match(/[?&]dp=([^&"']+)/)?.[1] || "";
  if (!vqd) return urls;

  const response = await client.get<{ results?: Array<{ image?: string }> }>(
    "https://duckduckgo.com/i.js",
    {
      params: { l: "wt-wt", o: "json", q: query, vqd, f: ",,,,", p: "1", dp },
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: pageUrl,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      timeout: 15000,
    },
  );

  for (const result of response.data?.results ?? []) {
    const imageUrl = keepImageUrl(String(result.image || ""));
    if (imageUrl) urls.push(imageUrl);
  }
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

/** POST /api/upload/auto-fetch — product photo → local WebP, first working result. */
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
    const enhancedQuery = exactName + " منتج";

    let candidateUrls: string[] = [];
    try {
      candidateUrls = await searchBing(enhancedQuery);
    } catch (error) {
      console.error("[api/upload/auto-fetch] bing", error);
    }

    if (candidateUrls.length === 0) {
      try {
        candidateUrls = await searchDuckDuckGo(enhancedQuery);
      } catch (error) {
        console.error("[api/upload/auto-fetch] duckduckgo", error);
      }
    }

    if (candidateUrls.length === 0) {
      return NextResponse.json({ error: IP_BLOCKED }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    for (const imageUrl of candidateUrls) {
      if (isBlockedImageUrl(imageUrl)) continue;

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
