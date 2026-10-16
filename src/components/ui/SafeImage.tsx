"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { clsx } from "clsx";

interface SafeImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Fill a positioned parent. Otherwise the className box is the frame. */
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
}

/**
 * Turn a stored image address into a root-relative /uploads path when the
 * file belongs to this app, then percent-encode it exactly once.
 * Returns null when there is nothing to show.
 */
function normalizeImageUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw || raw === "/placeholder.png") return null;

  let clean = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/uploads/")) {
        clean = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      clean = raw;
    }
  }

  try {
    return encodeURI(decodeURI(clean));
  } catch {
    try {
      return encodeURI(clean);
    } catch {
      return null;
    }
  }
}

function ImageFallback({
  className,
  fill,
}: {
  className?: string;
  fill?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        "flex items-center justify-center bg-slate-100 text-slate-400",
        fill ? "absolute inset-0" : "relative block overflow-hidden",
        className,
      )}
    >
      <ImageOff className="h-4 w-4 shrink-0" />
    </span>
  );
}

/**
 * Thumbnail that loads /uploads files directly (no /_next/image proxy).
 * A failed or empty source becomes a gray icon box, once, with no retry loop.
 */
export function SafeImage({
  src,
  alt = "",
  className,
  fill,
}: SafeImageProps) {
  const normalized = normalizeImageUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [normalized]);

  if (!normalized || failed) {
    return <ImageFallback className={className} fill={fill} />;
  }

  const image = (
    // Uploaded files are already WebP from sharp. Skip the Next optimizer
    // so production does not rewrite them through /_next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalized}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={clsx(
        "absolute inset-0 h-full w-full object-cover",
        fill ? className : undefined,
      )}
      onError={() => setFailed(true)}
    />
  );

  if (fill) return image;

  return (
    <span className={clsx("relative block overflow-hidden", className)}>
      {image}
    </span>
  );
}
