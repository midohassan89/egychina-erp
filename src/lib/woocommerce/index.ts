import { fetchAllPages, wooCommerceFetch } from "./client";
import type {
  CreateOrderPayload,
  PaginatedParams,
  WooCommerceCategory,
  WooCommerceCustomer,
  WooCommerceOrder,
  WooCommerceProduct,
} from "@/types/woocommerce";

export async function getProducts(
  params: PaginatedParams & { lang?: string } = {},
): Promise<WooCommerceProduct[]> {
  const { page, perPage = 100, search, lang } = params;

  if (page) {
    return wooCommerceFetch<WooCommerceProduct[]>("products", {
      params: {
        page,
        per_page: perPage,
        search,
        status: "publish",
        lang,
      },
    });
  }

  return fetchAllPages<WooCommerceProduct>("products", {
    search,
    status: "publish",
    lang,
  });
}

export async function getProductById(id: number): Promise<WooCommerceProduct> {
  return wooCommerceFetch<WooCommerceProduct>(`products/${id}`);
}

export async function getCategories(
  params: PaginatedParams = {},
): Promise<WooCommerceCategory[]> {
  const { page, perPage = 100, search } = params;

  if (page) {
    return wooCommerceFetch<WooCommerceCategory[]>("products/categories", {
      params: {
        page,
        per_page: perPage,
        search,
        hide_empty: false,
      },
    });
  }

  return fetchAllPages<WooCommerceCategory>("products/categories", {
    search,
    hide_empty: false,
  });
}

export async function getCustomers(
  params: PaginatedParams = {},
): Promise<WooCommerceCustomer[]> {
  const { page, perPage = 100, search } = params;

  if (page) {
    return wooCommerceFetch<WooCommerceCustomer[]>("customers", {
      params: {
        page,
        per_page: perPage,
        search,
      },
    });
  }

  return fetchAllPages<WooCommerceCustomer>("customers", { search });
}

export async function getCustomerById(
  id: number,
): Promise<WooCommerceCustomer> {
  return wooCommerceFetch<WooCommerceCustomer>(`customers/${id}`);
}

export async function createOrder(
  payload: CreateOrderPayload,
): Promise<WooCommerceOrder> {
  return wooCommerceFetch<WooCommerceOrder>("orders", {
    method: "POST",
    body: payload,
  });
}

export { WooCommerceError } from "./client";
