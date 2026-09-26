export class WooCommerceError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
  ) {
    super(message);
    this.name = "WooCommerceError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/** Network sync is disabled. Callers must update Prisma only. */
export async function wooCommerceFetch<T>(
  endpoint: string,
  _options: FetchOptions = {},
): Promise<T> {
  throw new WooCommerceError(
    "WooCommerce sync is disabled. This ERP updates the local database only.",
    410,
    endpoint,
  );
}

export async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  perPage = 100,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const batch = await wooCommerceFetch<T[]>(endpoint, {
      params: { ...params, page, per_page: perPage },
    });

    results.push(...batch);
    hasMore = batch.length === perPage;
    page += 1;
  }

  return results;
}
