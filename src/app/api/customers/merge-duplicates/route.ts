import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { mergeDuplicateCustomers } from "@/lib/customers/mergePhones";

/** POST /api/customers/merge-duplicates — fold +20 and 01 copies into one customer. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let ids: string[] | undefined;
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) {
      ids = body.ids.map((id) => String(id)).filter(Boolean);
    }
  } catch {
    ids = undefined;
  }

  const result = await mergeDuplicateCustomers(ids);
  return NextResponse.json({ ok: true, ...result });
}
