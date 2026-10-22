export function BrandLogo({
  className,
  alt = "ايجي شاينا ماركت",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src="/logos/logo-ar.svg"
      alt={alt}
      className={className}
    />
  );
}
