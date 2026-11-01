import { NextResponse } from "next/server";

export const mobilePosCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

export function mobilePosOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: mobilePosCorsHeaders,
  });
}
