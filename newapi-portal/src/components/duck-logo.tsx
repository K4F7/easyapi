import Image from "next/image";
import { cn } from "@/lib/utils";

type DuckLogoProps = {
  className?: string;
  size?: number;
};

export function DuckLogo({ className, size = 32 }: DuckLogoProps) {
  const sizedByClass = /\b(h-|w-|size-)/.test(className ?? "");

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={sizedByClass ? undefined : { width: size, height: size }}
    >
      <Image
        src="/duck.webp"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        unoptimized
      />
    </div>
  );
}
