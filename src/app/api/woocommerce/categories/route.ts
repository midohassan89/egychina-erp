import { NextResponse } from "next/server";
import { getCategories } from "@/lib/woocommerce";
import { wooCommerceErrorResponse } from "@/lib/woocommerce/apiResponse";

export async function GET() {
  try {
    const categories = await getCategories();
    return NextResponse.json(categories);
  } catch (error) {
    return wooCommerceErrorResponse(error, "WooCommerce API");
  }
}
