import { NextResponse } from "next/server";
import { getCustomers } from "@/lib/woocommerce";
import { wooCommerceErrorResponse } from "@/lib/woocommerce/apiResponse";

export async function GET() {
  try {
    const customers = await getCustomers();
    return NextResponse.json(customers);
  } catch (error) {
    return wooCommerceErrorResponse(error, "WooCommerce API");
  }
}
