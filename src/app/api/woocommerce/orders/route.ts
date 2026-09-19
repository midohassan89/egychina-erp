import { NextResponse } from "next/server";
import { createOrder } from "@/lib/woocommerce";
import { wooCommerceErrorResponse } from "@/lib/woocommerce/apiResponse";
import type { CreateOrderPayload } from "@/types/woocommerce";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateOrderPayload;
    if (!payload?.line_items?.length) {
      return NextResponse.json(
        { error: "Order must include at least one line item." },
        { status: 400 },
      );
    }

    const order = await createOrder(payload);
    return NextResponse.json(order);
  } catch (error) {
    return wooCommerceErrorResponse(error, "Orders API");
  }
}
