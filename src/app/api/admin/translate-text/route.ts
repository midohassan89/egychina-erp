import { NextResponse } from "next/server";
import { translate } from "google-translate-api-x";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";

async function translateTo(text: string, to: "en" | "zh-CN") {
  const result = await translate(text, { from: "ar", to });
  return result.text?.trim() ?? "";
}

/** POST /api/admin/translate-text — Arabic text to English and Chinese. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { text?: unknown };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const [en, zh] = await Promise.all([
      translateTo(text, "en"),
      translateTo(text, "zh-CN"),
    ]);
    if (!en || !zh) {
      return NextResponse.json(
        { error: "Translation was empty" },
        { status: 502 },
      );
    }

    return NextResponse.json({ en, zh });
  } catch (error) {
    console.error("[api/admin/translate-text]", error);
    const message =
      error instanceof Error ? error.message : "Could not translate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
