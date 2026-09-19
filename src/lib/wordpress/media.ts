import { WooCommerceError } from "@/lib/woocommerce/client";

export interface WordPressMedia {
  id: number;
  source_url: string;
  media_details?: {
    sizes?: Record<string, { source_url?: string }>;
  };
}

function getWordPressAuth(): { baseUrl: string; authHeader: string } {
  const baseUrl = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APPLICATION_PASSWORD;

  if (!baseUrl) {
    throw new WooCommerceError(
      "Missing WOOCOMMERCE_URL for WordPress Media uploads.",
    );
  }

  if (!username || !appPassword) {
    throw new WooCommerceError(
      "Missing WordPress media credentials. Set WORDPRESS_USERNAME and WORDPRESS_APPLICATION_PASSWORD (Application Password) in the environment.",
    );
  }

  // App passwords are often copied with spaces — strip them
  const password = appPassword.replace(/\s+/g, "");
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  return { baseUrl, authHeader };
}

/**
 * Upload a binary image to WordPress Media Library via /wp-json/wp/v2/media.
 */
export async function uploadWordPressMedia(input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<WordPressMedia> {
  const { baseUrl, authHeader } = getWordPressAuth();
  const url = `${baseUrl}/wp-json/wp/v2/media`;

  const safeName = input.filename.replace(/[^\w.\-]+/g, "_") || "product.jpg";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Type": input.contentType || "image/jpeg",
    },
    body: new Uint8Array(input.buffer),
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // ignore
    }
    throw new WooCommerceError(
      `WordPress media upload failed: ${detail}`,
      response.status,
      "wp/v2/media",
    );
  }

  return (await response.json()) as WordPressMedia;
}
