"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { safeImageUrl } from "@/lib/images/safeImageUrl";

const PLACEHOLDER = "/placeholder.png";

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
 * Product thumbnail that percent-encodes legacy absolute URLs (Arabic filenames),
 * rewrites stored localhost addresses for the live host, and skips the Next.js
 * image optimizer. The optimizer rejects those remote addresses and some local
 * uploads with "upstream response is invalid".
 */
export function SafeImage({
  src,
  alt = "",
  className,
  fill,
  sizes,
}: SafeImageProps) {
  const formatted = safeImageUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [formatted]);

  const safeUrl = failed ? PLACEHOLDER : formatted;
  const image = (
    <Image
      alt={alt}
      className={fill ? className : "object-cover"}
      fill
      sizes={sizes ?? "96px"}
      src={safeUrl}
      unoptimized
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );

  if (fill) return image;

  return (
    <span className={`relative block overflow-hidden ${className ?? ""}`}>
      {image}
    </span>
  );
}
