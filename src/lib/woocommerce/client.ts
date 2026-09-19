import type { WooCommerceConfig } from "@/types/woocommerce";

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

function getServerConfig(): WooCommerceConfig {
  const baseUrl = process.env.WOOCOMMERCE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!baseUrl || !consumerKey || !consumerSecret) {
    throw new WooCommerceError(
      "Missing WooCommerce credentials. Set WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, and WOOCOMMERCE_CONSUMER_SECRET in your environment.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    consumerKey,
    consumerSecret,
  };
}

function buildAuthHeader(config: WooCommerceConfig): string {
  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export async function wooCommerceFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const config = getServerConfig();
  const url = new URL(`${config.baseUrl}/wp-json/wc/v3/${endpoint}`);
  const method = options.method ?? "GET";

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: buildAuthHeader(config),
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // ignore parse errors
    }
    throw new WooCommerceError(
      `WooCommerce API error: ${detail}`,
      response.status,
      endpoint,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
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
