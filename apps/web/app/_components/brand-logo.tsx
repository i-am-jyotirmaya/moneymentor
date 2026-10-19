import Image from "next/image";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      alt="Spndrr"
      className={`h-12 w-auto max-w-full object-contain ${className}`}
      height={190}
      loading="eager"
      src="/brand/spndrr-logo.webp"
      unoptimized
      width={640}
    />
  );
}
