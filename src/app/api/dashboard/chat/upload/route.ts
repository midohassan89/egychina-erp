import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUsePos } from "@/lib/auth/roles";
import { saveChatAttachment } from "@/lib/chat/saveAttachment";

/** POST /api/dashboard/chat/upload — staff image or file for a customer chat. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUsePos(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "اختر ملفاً" }, { status: 400 });
  }
  try {
    const saved = await saveChatAttachment(file);
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر رفع الملف" },
      { status: 400 },
    );
  }
}
