import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEditor } from "@/lib/auth/roles";

/** Catalog pull from WooCommerce is disabled. The ERP catalog is local. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    { error: "WooCommerce catalog sync is disabled." },
    { status: 410 },
  );
}
