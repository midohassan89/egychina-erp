import { NextResponse } from "next/server";
import { WooCommerceError } from "./client";

export function wooCommerceErrorResponse(error: unknown, logLabel: string) {
  if (error instanceof WooCommerceError) {
    return NextResponse.json(
      { error: error.message, endpoint: error.endpoint },
      { status: error.statusCode ?? 500 },
    );
  }

  console.error(`[${logLabel}]`, error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
