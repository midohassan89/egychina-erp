import { NextResponse } from "next/server";
import { saveChatAttachment } from "@/lib/chat/saveAttachment";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST /api/customer/chat/upload — store and mobile chat attachment. */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "اختر ملفاً" }, { status: 400, headers: corsHeaders });
  }
  try {
    const saved = await saveChatAttachment(file);
    return NextResponse.json(saved, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر رفع الملف" },
      { status: 400, headers: corsHeaders },
    );
  }
}
