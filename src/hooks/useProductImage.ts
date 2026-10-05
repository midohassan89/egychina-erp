"use client";

import { useCallback, useState } from "react";
import { compressImageForUpload } from "@/lib/images/compressClient";
import {
  FETCH_IMAGE_FALLBACK_ERROR,
  fetchProductImageFromWeb,
  uploadProductImageFile,
} from "@/lib/images/fetchProductImage";

/**
 * Shared loading/error state for product image fetch (Google) + local upload.
 * Wired into Add Product, Edit Product, and Purchases quick-add via ImagePicker.
 */
export function useProductImage() {
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchFromInternet = useCallback(
    async (productName: string, productId?: string): Promise<string | null> => {
      setError(null);
      setFetching(true);
      try {
        return await fetchProductImageFromWeb({ productName, productId });
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : FETCH_IMAGE_FALLBACK_ERROR;
        setError(message);
        return null;
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  const uploadFromDevice = useCallback(async (file: File): Promise<string | null> => {
    setError(null);
    setUploading(true);
    try {
      const compressed = await compressImageForUpload(file);
      return await uploadProductImageFile(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الصورة");
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return {
    fetching,
    uploading,
    busy: fetching || uploading,
    error,
    setError,
    clearError,
    fetchFromInternet,
    uploadFromDevice,
  };
}
