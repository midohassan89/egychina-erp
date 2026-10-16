import Image from "next/image";
import { safeImageUrl } from "@/lib/images/safeImageUrl";

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
 * Product thumbnail that percent-encodes legacy absolute URLs (Arabic filenames)
 * and skips the Next.js image optimizer. The optimizer rejects those remote
 * addresses and some local uploads with "upstream response is invalid".
 */
export function SafeImage({
  src,
  alt = "",
  className,
  fill,
  sizes,
}: SafeImageProps) {
  const safeUrl = safeImageUrl(src);
  const image = (
    <Image
      alt={alt}
      className={fill ? className : "object-cover"}
      fill
      sizes={sizes ?? "96px"}
      src={safeUrl}
      unoptimized
    />
  );

  if (fill) return image;

  return (
    <span className={`relative block overflow-hidden ${className ?? ""}`}>
      {image}
    </span>
  );
}
