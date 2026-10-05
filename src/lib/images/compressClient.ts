const MAX_DIMENSION = 800;
const QUALITY = 0.7;

/**
 * Resize & compress an image in the browser (Canvas API) before upload.
 * Max edge 800px, WebP (or JPEG fallback) at ~0.7 quality.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  // Already-small images still get re-encoded for consistent format/size.
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = await canvasToBlob(canvas, "image/webp", QUALITY);
    if (webp && webp.size > 0) {
      return new File([webp], replaceExtension(file.name, ".webp"), {
        type: "image/webp",
        lastModified: Date.now(),
      });
    }

    const jpeg = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    if (!jpeg || jpeg.size <= 0) {
      throw new Error("Could not compress image");
    }
    return new File([jpeg], replaceExtension(file.name, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= max && height <= max) {
    return { width, height };
  }
  const scale = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}${ext}`;
}
