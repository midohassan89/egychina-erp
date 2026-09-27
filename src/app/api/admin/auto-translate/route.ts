import { NextResponse } from "next/server";
import { translate } from "google-translate-api-x";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

async function translateName(name: string, to: "en" | "zh-CN") {
  const result = await translate(name, { from: "ar", to });
  const text = result.text?.trim() ?? "";
  if (!text) {
    throw new Error(`No ${to} translation returned`);
  }
  return text;
}

/** POST /api/admin/auto-translate — Arabic name to English and Chinese. */
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
      type?: unknown;
      id?: unknown;
      name?: unknown;
    };
    const type = body.type === "product" || body.type === "category" ? body.type : "";
    const id = String(body.id ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!type || !id || !name) {
      return NextResponse.json(
        { error: "type, id, and name are required" },
        { status: 400 },
      );
    }

    const nameEn = await translateName(name, "en");
    const nameZh = await translateName(name, "zh-CN");

    if (type === "product") {
      const existing = await prisma.product.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      await prisma.product.update({
        where: { id },
        data: { nameEn, nameZh },
      });
    } else {
      const existing = await prisma.category.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      await prisma.category.update({
        where: { id },
        data: { nameEn, nameZh },
      });
    }

    return NextResponse.json({ ok: true, nameEn, nameZh });
  } catch (error) {
    console.error("[api/admin/auto-translate]", error);
    const message =
      error instanceof Error ? error.message : "Could not translate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
