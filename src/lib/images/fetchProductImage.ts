/**
 * Shared client helpers for product image fetch/upload.
 * Used by ImagePicker (Add / Edit / Purchases quick-add) and admin auto-images.
 */

export const FETCH_IMAGE_API = "/api/admin/fetch-image";
export const UPLOAD_IMAGE_API = "/api/admin/upload-image";

/** Matches the API's final fallback when the 5-URL loop fails. */
export const FETCH_IMAGE_FALLBACK_ERROR =
  "عفواً، لم نتمكن من جلب صورة صالحة لهذا المنتج من الإنترنت. يرجى إضافتها يدوياً.";

export const PRODUCT_NAME_REQUIRED_ERROR = "أدخل اسم المنتج أولاً";

export async function fetchProductImageFromWeb(options: {
  productName: string;
  productId?: string;
}): Promise<string> {
  const productName = options.productName.trim();
  if (!productName) {
    throw new Error(PRODUCT_NAME_REQUIRED_ERROR);
  }

  const res = await fetch(FETCH_IMAGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productName,
      ...(options.productId ? { productId: options.productId } : {}),
    }),
  });

  let body: { error?: string; imageUrl?: string } = {};
  try {
    body = (await res.json()) as { error?: string; imageUrl?: string };
  } catch {
    // Non-JSON response
  }

  if (!res.ok || !body.imageUrl) {
    throw new Error(body.error?.trim() || FETCH_IMAGE_FALLBACK_ERROR);
  }

  return body.imageUrl;
}

export async function uploadProductImageFile(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file);

  const res = await fetch(UPLOAD_IMAGE_API, {
    method: "POST",
    body: form,
  });

  let body: { error?: string; imageUrl?: string } = {};
  try {
    body = (await res.json()) as { error?: string; imageUrl?: string };
  } catch {
    // Non-JSON response
  }

  if (!res.ok || !body.imageUrl) {
    throw new Error(body.error?.trim() || "فشل رفع الصورة");
  }

  return body.imageUrl;
}
