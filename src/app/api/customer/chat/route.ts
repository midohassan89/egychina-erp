import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { translateTrio, type LangCode } from "@/lib/i18n/translateText";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, x-lang, Authorization",
};

function preferredLang(request: Request, value?: unknown): LangCode {
  const raw = String(value ?? request.headers.get("x-lang") ?? "ar").trim().toLowerCase();
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("zh")) return "zh";
  return "ar";
}

function visibleText(row: { textAr: string; textEn: string; textZh: string }, lang: LangCode) {
  if (lang === "en") return row.textEn || row.textAr;
  if (lang === "zh") return row.textZh || row.textAr;
  return row.textAr;
}

export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const customer = await resolveStoreCustomer(prisma, {
    customerId: resolveCustomerIdFromRequest(request),
    phone: resolvePhoneFromRequest(request),
    createIfMissing: false,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }
  const lang = preferredLang(request, new URL(request.url).searchParams.get("lang"));
  await prisma.chatMessage.updateMany({
    where: { customerId: customer.id, senderRole: "ADMIN", isReadByCustomer: false },
    data: { isReadByCustomer: true },
  });
  const messages = await prisma.chatMessage.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({
    ok: true,
    messages: messages.map((row) => ({
      id: row.id,
      senderRole: row.senderRole,
      text: visibleText(row, lang),
      textAr: row.textAr,
      textEn: row.textEn,
      textZh: row.textZh,
      originalText: row.originalText,
      originalLang: row.originalLang,
      createdAt: row.createdAt.toISOString(),
    })),
  }, { headers: corsHeaders });
}

export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  let body: { text?: unknown; lang?: unknown; customerId?: unknown; phone?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }
  const text = String(body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400, headers: corsHeaders });
  }
  const customer = await resolveStoreCustomer(prisma, {
    customerId: resolveCustomerIdFromRequest(request, body.customerId),
    phone: resolvePhoneFromRequest(request, body.phone),
    createIfMissing: false,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }
  const lang = preferredLang(request, body.lang);
  const translated = await translateTrio(text, lang);
  const message = await prisma.chatMessage.create({
    data: {
      customerId: customer.id,
      senderRole: "CUSTOMER",
      originalText: text,
      originalLang: lang,
      textAr: translated.textAr,
      textEn: translated.textEn,
      textZh: translated.textZh,
      isReadByCustomer: true,
      isReadByAdmin: false,
    },
  });
  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      text: visibleText(message, lang),
      textAr: message.textAr,
      textEn: message.textEn,
      textZh: message.textZh,
      createdAt: message.createdAt.toISOString(),
    },
  }, { status: 201, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
