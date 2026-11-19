import Image from "next/image";

export function BrandLogo({
  className = "",
  variant = "light",
  revamp = false,
}: {
  className?: string;
  variant?: "light" | "dark";
  revamp?: boolean;
}) {
  const suffix = variant === "dark" ? "-dark" : "";
  return (
    <Image
      alt="Spndrr"
      className={`h-12 w-auto max-w-full object-contain ${className}`}
      height={204}
      loading="eager"
      src={revamp ? `/brand/cobalt-slice/spndrr-logo${suffix}.svg` : `/brand/spndrr-logo${suffix}.webp`}
      unoptimized
      width={640}
    />
  );
}
