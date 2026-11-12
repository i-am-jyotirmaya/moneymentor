import Image from "next/image";

export function BrandLogo({
  className = "",
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  return (
    <Image
      alt="Spndrr"
      className={`h-12 w-auto max-w-full object-contain ${className}`}
      height={204}
      loading="eager"
      src={variant === "dark" ? "/brand/spndrr-logo-dark.webp" : "/brand/spndrr-logo.webp"}
      unoptimized
      width={640}
    />
  );
}
