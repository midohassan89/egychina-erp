import { NextResponse } from "next/server";
import { getProducts } from "@/lib/woocommerce";
import { wooCommerceErrorResponse } from "@/lib/woocommerce/apiResponse";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch (error) {
    return wooCommerceErrorResponse(error, "WooCommerce API");
  }
}
