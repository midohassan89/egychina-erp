import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { translate as translateWithVitalets } from "@vitalets/google-translate-api";
import { translate as translateWithClient } from "google-translate-api-x";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DDG_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; rv:122.0) Gecko/20100101 Firefox/122.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ar,ar-EG;q=0.9,en-US;q=0.8,en;q=0.7",
};

const NOT_FOUND = "Product not found anywhere";

type OffProduct = {
  product_name_ar?: string;
  product_name_en?: string;
  product_name?: string;
};

function firstText(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const name = value?.replace(/\s+/g, " ").trim();
    if (name) return name;
  }
  return null;
}

/** Drop store names and promo words that ride along on shopping titles. */
export function cleanSearchTitle(raw: string): string {
  let title = raw.replace(/\s+/g, " ").trim();
  const phrases = [
    /سعر\s*ومواصفات/gi,
    /اشتري|اشترِ|اشتر/gi,
    /كارفور/gi,
    /أمازون|امازون/gi,
    /تسوق/gi,
    /اونلاين|أونلاين|أون\s*لاين/gi,
    /\bbuy\b/gi,
    /\bprice\b/gi,
    /\bnoon\b/gi,
    /\bcarrefour\b/gi,
    /\bamazon\b/gi,
    /\begypt\b/gi,
  ];
  for (const pattern of phrases) title = title.replace(pattern, " ");
  title = title.replace(/(^|[\s|•·/])(?:سعر|نون|مصر)(?=$|[\s|•·/])/g, " ");
  title = title.replace(/[|]/g, " ");
  title = title.replace(/\s+[-–—]\s+/g, " ");
  title = title.replace(/^[-–—\s]+|[-–—\s]+$/g, "");
  return title.replace(/\s{2,}/g, " ").trim();
}

async function translateToArabic(text: string): Promise<string> {
  try {
    const translation = await translateWithVitalets(text, { to: "ar" });
    const arabic = translation.text.replace(/\s+/g, " ").trim();
    if (arabic && /[\u0600-\u06FF]/.test(arabic)) return arabic;
  } catch (error) {
    console.error("[barcode-lookup] translate", error);
  }

  const fallback = await translateWithClient(text, { to: "ar" });
  return fallback.text?.replace(/\s+/g, " ").trim() || text;
}

async function lookupOpenFoodFacts(barcode: string): Promise<string | null> {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "EgychinaERP/1.0 (barcode name lookup)",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    status?: number;
    product?: OffProduct;
  };
  if (body.status !== 1 || !body.product) return null;
  return firstText(
    body.product.product_name_ar,
    body.product.product_name_en,
    body.product.product_name,
  );
}

/** Strip highlight markers that split Arabic before translation. */
function sanitizeExtractedTitle(title: string): string {
  let sanitizedText = title;
  sanitizedText = sanitizedText.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, "");
  sanitizedText = sanitizedText.replace(/['"‘’“”]/g, "");
  sanitizedText = sanitizedText.replace(/\s+/g, " ").trim();
  return sanitizedText;
}

function prepareLookupName(
  raw: string,
  barcode: string,
): { raw: string; cleaned: string } | null {
  const sanitized = sanitizeExtractedTitle(raw);
  const cleaned = cleanSearchTitle(sanitized);
  if (cleaned.length < 2 || cleaned === barcode) return null;
  return { raw: sanitized, cleaned };
}

function extractDuckDuckGoTitle(html: string): string {
  const $ = cheerio.load(html);
  const firstResult = $(".result__title .result__a").first();

  if (firstResult.length === 0) {
    console.log("DDG Scraper: No results found.");
    throw new Error("No organic DDG results");
  }

  const title = firstResult.text();
  console.log("DDG extracted title:", title.trim() || "(none)");
  if (!title.trim()) throw new Error("No organic DDG results");
  return title;
}

async function lookupDuckDuckGo(barcode: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(barcode)}`;
  const response = await fetch(url, {
    headers: DDG_HEADERS,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
    redirect: "follow",
  });
  console.log("DDG Fetch Status:", response.status);
  if (!response.ok) throw new Error("No organic DDG results");

  const html = await response.text();
  return extractDuckDuckGoTitle(html);
}

/** GET /api/external/barcode-lookup?barcode= */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim() ?? "";
  if (!barcode || barcode.length > 32) {
    return NextResponse.json(
      { success: false, message: "Barcode is required" },
      { status: 400 },
    );
  }

  let source: "Open Food Facts" | "DuckDuckGo" | null = null;
  let rawExtractedName = "";
  let cleanedName = "";

  try {
    const searchedName = await lookupDuckDuckGo(barcode);
    const prepared = prepareLookupName(searchedName, barcode);
    if (!prepared) throw new Error("No organic DDG results");
    source = "DuckDuckGo";
    rawExtractedName = prepared.raw;
    cleanedName = prepared.cleaned;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "No organic DDG results") {
      console.log("[barcode-lookup] duckduckgo missed, trying Open Food Facts");
    } else {
      console.error("[barcode-lookup] duckduckgo", error);
    }
  }

  if (!cleanedName) {
    try {
      const officialName = await lookupOpenFoodFacts(barcode);
      const prepared = officialName ? prepareLookupName(officialName, barcode) : null;
      if (prepared) {
        source = "Open Food Facts";
        rawExtractedName = prepared.raw;
        cleanedName = prepared.cleaned;
      }
    } catch (error) {
      console.error("[barcode-lookup] openfoodfacts", error);
    }
  }

  if (!cleanedName || !source) {
    console.log("[barcode-lookup]", {
      barcode,
      source,
      rawExtractedName,
      cleanedName,
      translatedName: null,
    });
    return NextResponse.json({ success: false, message: NOT_FOUND }, { status: 404 });
  }

  const containsArabic = /[\u0600-\u06FF]/.test(cleanedName);
  let finalTranslatedName = cleanedName;
  if (!containsArabic) {
    try {
      finalTranslatedName = await translateToArabic(cleanedName);
    } catch (error) {
      console.error("[barcode-lookup] translate", error);
    }
  }

  console.log("[barcode-lookup]", {
    barcode,
    source,
    rawExtractedName,
    cleanedName,
    translatedName: finalTranslatedName,
  });

  return NextResponse.json({
    success: true,
    translatedName: finalTranslatedName,
    originalName: cleanedName,
    source,
  });
}
