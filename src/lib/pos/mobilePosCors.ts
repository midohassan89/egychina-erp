import { NextResponse } from "next/server";

export const mobilePosCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function mobilePosJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: mobilePosCorsHeaders,
  });
}

/** Standard Arabic error payload for the mobile cashier app. */
export function mobilePosError(
  messageAr: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return mobilePosJson(
    {
      ok: false,
      error: messageAr,
      message: messageAr,
      ...extra,
    },
    status,
  );
}

export function mobilePosOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: mobilePosCorsHeaders,
  });
}
